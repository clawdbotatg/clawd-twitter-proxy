import { randomBytes, createHash } from "crypto";
import { Redis } from "@upstash/redis";
import { PriceState, startPriceFor } from "./price";
import { JOB_TIMEOUT_MS, SESSION_TTL_MS } from "./limits";
import { fetchHighestCV } from "./larv";

/** All state lives in Upstash Redis under the `ctp:` prefix:
 *   ctp:price            PriceState — the running auction
 *   ctp:s:<id>           Session JSON
 *   ctp:w:<wallet>       set of that wallet's session ids
 *   ctp:img:<id>:<n>     base64 JPEG of a generated image
 *   ctp:jobs             list — work for the Mac worker (RPUSH / LPOP)
 *   ctp:feed             list — posted tweets, newest first
 *   ctp:lock:<key>       short mutex for read-modify-write
 *   ctp:hot              set while anyone is mid-session: the worker polls fast */

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const redis = new Redis({ url: url!, token: token! });

/** KEY_PREFIX lets a local dev run share a Redis without touching prod keys. */
const P = process.env.KEY_PREFIX || "ctp:";

export type Role = "user" | "clawd";
export interface Message {
  role: Role;
  text: string;
  /** clawd turns carry the draft they produced (if any). */
  draft?: string | null;
  ts: number;
}
export interface SessionImage {
  n: number;
  prompt: string;
  withClawd: boolean;
  status: "pending" | "ready" | "refused" | "failed";
  note?: string;
}
export type JobType = "turn" | "image" | "post";
export interface Session {
  id: string;
  wallet: string;
  pricePaid: number;
  createdAt: number;
  expiresAt: number;
  tokenHash: string;
  /** user turns consumed (only successful clawd replies count). */
  turns: number;
  messages: Message[];
  draft: string | null;
  imageIdea: string | null;
  images: SessionImage[];
  /** n of the image to attach, or null for text-only. */
  attachImage: number | null;
  status: "unpaid" | "active" | "posted" | "void";
  pending: { type: JobType; since: number; jobId: string } | null;
  notice: string | null;
  tweet: { id: string; url: string; text: string; postedAt: number } | null;
}

export interface Job {
  jobId: string;
  type: JobType;
  sessionId: string;
  /** image job: which image slot. */
  n?: number;
}

export interface FeedItem {
  url: string;
  text: string;
  wallet: string;
  pricePaid: number;
  postedAt: number;
  sessionId: string;
  image: number | null;
}

export function newId(bytes = 12): string {
  return randomBytes(bytes).toString("hex");
}
export function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

// ---------- locking ----------

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const lockKey = `${P}lock:${key}`;
  const me = newId(8);
  for (let i = 0; i < 50; i++) {
    const ok = await redis.set(lockKey, me, { nx: true, px: 10_000 });
    if (ok) {
      try {
        return await fn();
      } finally {
        const cur = await redis.get<string>(lockKey);
        if (cur === me) await redis.del(lockKey);
      }
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("busy — try again");
}

// ---------- price ----------

export async function getPriceState(): Promise<PriceState> {
  const s = await redis.get<PriceState>(`${P}price`);
  if (s) return s;
  return withLock("price", async () => {
    const again = await redis.get<PriceState>(`${P}price`);
    if (again) return again;
    const highest = await fetchHighestCV();
    const init: PriceState = { resetAt: Date.now(), startPrice: startPriceFor(highest ?? 0) };
    await redis.set(`${P}price`, init);
    return init;
  });
}

/** A tweet posted: restart the auction at 10% of today's top holder. */
export async function resetPrice(): Promise<PriceState> {
  const highest = await fetchHighestCV();
  return withLock("price", async () => {
    const prev = await redis.get<PriceState>(`${P}price`);
    const next: PriceState = {
      resetAt: Date.now(),
      startPrice: highest ? startPriceFor(highest) : prev?.startPrice ?? startPriceFor(0),
    };
    await redis.set(`${P}price`, next);
    return next;
  });
}

// ---------- sessions ----------

const ttlSec = Math.ceil((SESSION_TTL_MS * 8) / 1000); // keep the record a week past expiry

export async function getSession(id: string): Promise<Session | null> {
  if (!/^[0-9a-f]{24}$/.test(id)) return null;
  const s = await redis.get<Session>(`${P}s:${id}`);
  if (!s) return null;
  // A job the worker never answered: release it so the user can retry.
  if (s.pending && Date.now() - s.pending.since > JOB_TIMEOUT_MS) {
    return updateSession(id, x => {
      if (x.pending && Date.now() - x.pending.since > JOB_TIMEOUT_MS) {
        if (x.pending.type === "image") {
          const img = x.images.find(i => i.status === "pending");
          if (img) { img.status = "failed"; img.note = "timed out"; }
        }
        x.pending = null;
        x.notice = "clawd took too long on that one — nothing was spent, try again.";
      }
    });
  }
  return s;
}

export async function saveSession(s: Session): Promise<void> {
  await redis.set(`${P}s:${s.id}`, s, { ex: ttlSec });
}

export async function updateSession(id: string, fn: (s: Session) => void | Promise<void>): Promise<Session | null> {
  return withLock(`s:${id}`, async () => {
    const s = await redis.get<Session>(`${P}s:${id}`);
    if (!s) return null;
    await fn(s);
    await saveSession(s);
    return s;
  });
}

export async function createSession(wallet: string, pricePaid: number): Promise<{ session: Session; token: string }> {
  const token = newId(24);
  const now = Date.now();
  const session: Session = {
    id: newId(12),
    wallet: wallet.toLowerCase(),
    pricePaid,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    tokenHash: hashToken(token),
    turns: 0,
    messages: [],
    draft: null,
    imageIdea: null,
    images: [],
    attachImage: null,
    status: "unpaid",
    pending: null,
    notice: null,
    tweet: null,
  };
  await saveSession(session);
  await redis.sadd(`${P}w:${session.wallet}`, session.id);
  await markHot();
  return { session, token };
}

/** Re-key a session (the wallet proved itself again) — returns the new token. */
export async function rotateToken(id: string): Promise<string | null> {
  const token = newId(24);
  const s = await updateSession(id, x => { x.tokenHash = hashToken(token); });
  return s ? token : null;
}

export async function walletSessions(wallet: string): Promise<Session[]> {
  const ids = await redis.smembers(`${P}w:${wallet.toLowerCase()}`);
  const all = await Promise.all(ids.map(id => getSession(id)));
  return all.filter((s): s is Session => !!s && s.status !== "unpaid" && s.status !== "void")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function authorized(s: Session, token: string | null | undefined): boolean {
  return !!token && hashToken(token) === s.tokenHash;
}

/** What the browser is allowed to see. */
export function publicView(s: Session) {
  const { tokenHash: _t, ...rest } = s;
  return rest;
}

// ---------- jobs ----------

/** Idle, the worker polls every ~20s to stay inside Upstash's free command
 * budget; any purchase or action marks the desk hot and it polls every second. */
export async function markHot(): Promise<void> {
  await redis.set(`${P}hot`, 1, { ex: 20 * 60 });
}
export async function isHot(): Promise<boolean> {
  return (await redis.exists(`${P}hot`)) === 1;
}

export async function enqueue(job: Job): Promise<void> {
  await redis.rpush(`${P}jobs`, job);
  await markHot();
}
export async function claimJob(): Promise<Job | null> {
  return (await redis.lpop<Job>(`${P}jobs`)) ?? null;
}

// ---------- images ----------

export async function putImage(id: string, n: number, b64: string): Promise<void> {
  await redis.set(`${P}img:${id}:${n}`, b64, { ex: 60 * 60 * 24 * 30 });
}
export async function getImage(id: string, n: number): Promise<string | null> {
  return redis.get<string>(`${P}img:${id}:${n}`);
}

// ---------- feed ----------

export async function pushFeed(item: FeedItem): Promise<void> {
  await redis.lpush(`${P}feed`, item);
  await redis.ltrim(`${P}feed`, 0, 49);
}
export async function getFeed(n = 20): Promise<FeedItem[]> {
  return (await redis.lrange<FeedItem>(`${P}feed`, 0, n - 1)) ?? [];
}
