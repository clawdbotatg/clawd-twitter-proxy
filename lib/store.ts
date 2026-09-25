import { randomBytes, createHash } from "crypto";
import { neon } from "@neondatabase/serverless";
import { PriceState, startPriceFor } from "./price";
import { JOB_TIMEOUT_MS, SESSION_TTL_MS } from "./limits";
import { fetchHighestCV } from "./larv";
import { TweetMetrics, nextCheckAt, scoreOf } from "./score";

/** All state lives in the `btt` schema of larv.ai's Neon Postgres, reached as
 * the `btt` role — which cannot see larv.ai's own tables (CV balances etc.).
 * Schema: tools/schema.sql. Tables: price, sessions, jobs, images, feed, hot. */

let _sql: ReturnType<typeof neon> | null = null;
function db() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = neon(url);
  }
  return _sql;
}

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
  /** generation prompt ("" for uploads) */
  prompt: string;
  source?: "generated" | "upload";
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

// ---------- price ----------

type PriceRow = { reset_at: string; start_price: string };
const toPrice = (r: PriceRow): PriceState => ({ resetAt: Number(r.reset_at), startPrice: Number(r.start_price) });

export async function getPriceState(): Promise<PriceState> {
  const rows = (await db()`SELECT reset_at, start_price FROM price WHERE id = 1`) as PriceRow[];
  if (rows[0]) return toPrice(rows[0]);
  const highest = await fetchHighestCV();
  // First boot: whoever inserts first wins; everyone reads the winner.
  await db()`INSERT INTO price (id, reset_at, start_price) VALUES (1, ${Date.now()}, ${startPriceFor(highest ?? 0)})
             ON CONFLICT (id) DO NOTHING`;
  const again = (await db()`SELECT reset_at, start_price FROM price WHERE id = 1`) as PriceRow[];
  return toPrice(again[0]);
}

/** clawd tweeted: restart the auction at 10% of today's top holder, clocked
 * from the tweet's time. Never moves the clock backwards (a late or replayed
 * report of an older tweet is a no-op). */
export async function resetPrice(at = Date.now()): Promise<PriceState> {
  const highest = await fetchHighestCV();
  const now = Math.min(at, Date.now());
  const rows = (highest
    ? await db()`INSERT INTO price (id, reset_at, start_price) VALUES (1, ${now}, ${startPriceFor(highest)})
                 ON CONFLICT (id) DO UPDATE SET reset_at = EXCLUDED.reset_at, start_price = EXCLUDED.start_price
                 WHERE price.reset_at < EXCLUDED.reset_at
                 RETURNING reset_at, start_price`
    // Oracle down: restart the clock at the previous start price.
    : await db()`INSERT INTO price (id, reset_at, start_price) VALUES (1, ${now}, ${startPriceFor(0)})
                 ON CONFLICT (id) DO UPDATE SET reset_at = EXCLUDED.reset_at
                 WHERE price.reset_at < EXCLUDED.reset_at
                 RETURNING reset_at, start_price`) as PriceRow[];
  return rows[0] ? toPrice(rows[0]) : getPriceState();
}

// ---------- sessions ----------

type SessionRow = { data: Session; version: number };

async function readSession(id: string): Promise<SessionRow | null> {
  const rows = (await db()`SELECT data, version FROM sessions WHERE id = ${id}`) as SessionRow[];
  return rows[0] ?? null;
}

export async function getSession(id: string): Promise<Session | null> {
  if (!/^[0-9a-f]{24}$/.test(id)) return null;
  const row = await readSession(id);
  if (!row) return null;
  const s = row.data;
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

/** Unconditional write (used right after create, before anyone else can race). */
export async function saveSession(s: Session): Promise<void> {
  await db()`INSERT INTO sessions (id, wallet, data, version, created_at)
             VALUES (${s.id}, ${s.wallet}, ${JSON.stringify(s)}::jsonb, 0, ${s.createdAt})
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = sessions.version + 1`;
}

/** Read-modify-write with optimistic concurrency: the write only lands if
 * nobody else wrote since we read; otherwise re-read and re-apply fn. */
export async function updateSession(id: string, fn: (s: Session) => void | Promise<void>): Promise<Session | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const row = await readSession(id);
    if (!row) return null;
    const s = row.data;
    await fn(s);
    const ok = (await db()`UPDATE sessions SET data = ${JSON.stringify(s)}::jsonb, version = version + 1
                           WHERE id = ${id} AND version = ${row.version} RETURNING id`) as unknown[];
    if (ok.length) return s;
    await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
  }
  throw new Error("busy — try again");
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
  const rows = (await db()`SELECT data FROM sessions WHERE wallet = ${wallet.toLowerCase()}
                           AND data->>'status' IN ('active', 'posted')
                           ORDER BY created_at DESC LIMIT 20`) as { data: Session }[];
  return rows.map(r => r.data);
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

/** Idle, the worker polls slowly; any purchase or action marks the desk hot
 * for 20 minutes and it polls every second. */
export async function markHot(): Promise<void> {
  const until = Date.now() + 20 * 60 * 1000;
  await db()`INSERT INTO hot (id, until) VALUES (1, ${until}) ON CONFLICT (id) DO UPDATE SET until = EXCLUDED.until`;
}
export async function isHot(): Promise<boolean> {
  const rows = (await db()`SELECT until FROM hot WHERE id = 1`) as { until: string }[];
  return !!rows[0] && Number(rows[0].until) > Date.now();
}

export async function enqueue(job: Job): Promise<void> {
  await db()`INSERT INTO jobs (job) VALUES (${JSON.stringify(job)}::jsonb)`;
  await markHot();
}

/** Oldest job, removed atomically — two pollers can never get the same one. */
export async function claimJob(): Promise<Job | null> {
  const rows = (await db()`DELETE FROM jobs WHERE seq = (
                             SELECT seq FROM jobs ORDER BY seq LIMIT 1 FOR UPDATE SKIP LOCKED
                           ) RETURNING job`) as { job: Job }[];
  return rows[0]?.job ?? null;
}

// ---------- images ----------

export async function putImage(id: string, n: number, b64: string): Promise<void> {
  await db()`INSERT INTO images (session_id, n, b64) VALUES (${id}, ${n}, ${b64})
             ON CONFLICT (session_id, n) DO UPDATE SET b64 = EXCLUDED.b64`;
}
export async function getImage(id: string, n: number): Promise<string | null> {
  const rows = (await db()`SELECT b64 FROM images WHERE session_id = ${id} AND n = ${n}`) as { b64: string }[];
  return rows[0]?.b64 ?? null;
}

// ---------- feed ----------

export async function pushFeed(item: FeedItem): Promise<void> {
  await db()`INSERT INTO feed (item) VALUES (${JSON.stringify(item)}::jsonb)`;
}
export async function getFeed(n = 20): Promise<FeedItem[]> {
  const rows = (await db()`SELECT item FROM feed ORDER BY seq DESC LIMIT ${n}`) as { item: FeedItem }[];
  return rows.map(r => r.item);
}

// ---------- worker status + notifications ----------

/** How long without a poll before we call the worker offline (idle poll is 20s). */
export const WORKER_STALE_MS = 2 * 60 * 1000;

export async function setWorkerStatus(paused: boolean, healthy: boolean): Promise<void> {
  await db()`INSERT INTO worker_status (id, seen_at, paused, healthy) VALUES (1, ${Date.now()}, ${paused}, ${healthy})
             ON CONFLICT (id) DO UPDATE SET seen_at = EXCLUDED.seen_at, paused = EXCLUDED.paused, healthy = EXCLUDED.healthy`;
}

/** Claude was down for `ms`: give every live session that time back. */
export async function extendActiveSessions(ms: number): Promise<number> {
  const now = Date.now();
  const rows = (await db()`SELECT id FROM sessions WHERE data->>'status' = 'active'
                           AND (data->>'expiresAt')::bigint > ${now - ms}`) as { id: string }[];
  for (const { id } of rows) await updateSession(id, s => { s.expiresAt += ms; });
  return rows.length;
}

/** Is the desk open for new purchases? */
export async function deskStatus(): Promise<{ open: boolean; reason: string | null }> {
  const rows = (await db()`SELECT seen_at, paused, healthy FROM worker_status WHERE id = 1`) as { seen_at: string; paused: boolean; healthy: boolean }[];
  const r = rows[0];
  if (!r || Date.now() - Number(r.seen_at) > WORKER_STALE_MS || !r.healthy) return { open: false, reason: "clawd is offline right now" };
  if (r.paused) return { open: false, reason: "the desk is closed for now" };
  return { open: true, reason: null };
}

export async function pushEvent(text: string): Promise<void> {
  await db()`INSERT INTO events (text) VALUES (${text})`;
}

/** Remove and return pending notifications (the worker sends them). */
export async function takeEvents(): Promise<string[]> {
  const rows = (await db()`DELETE FROM events WHERE seq IN (
                             SELECT seq FROM events ORDER BY seq LIMIT 10 FOR UPDATE SKIP LOCKED
                           ) RETURNING seq, text`) as { seq: string; text: string }[];
  return rows.sort((a, b) => Number(a.seq) - Number(b.seq)).map(r => r.text);
}

// ---------- creator scores ----------

export interface ScoreRow {
  tweet_id: string;
  wallet: string;
  url: string;
  text: string;
  posted_at: string;
  score: string;
  checks: number;
}

export async function trackTweet(t: { tweetId: string; sessionId: string; wallet: string; url: string; text: string; postedAt: number }): Promise<void> {
  await db()`INSERT INTO tweet_scores (tweet_id, session_id, wallet, url, text, posted_at, next_check_at)
             VALUES (${t.tweetId}, ${t.sessionId}, ${t.wallet}, ${t.url}, ${t.text}, ${t.postedAt}, ${nextCheckAt(t.postedAt, t.postedAt)})
             ON CONFLICT (tweet_id) DO NOTHING`;
}

/** Tweets whose next metrics read is due (the worker reads X, we score). */
export async function dueTweets(limit = 100): Promise<string[]> {
  const rows = (await db()`SELECT tweet_id FROM tweet_scores WHERE next_check_at IS NOT NULL AND next_check_at <= ${Date.now()}
                           ORDER BY next_check_at LIMIT ${limit}`) as { tweet_id: string }[];
  return rows.map(r => r.tweet_id);
}

export async function recordMetrics(tweetId: string, m: TweetMetrics | null): Promise<void> {
  const rows = (await db()`SELECT posted_at, checks FROM tweet_scores WHERE tweet_id = ${tweetId}`) as { posted_at: string; checks: number }[];
  if (!rows[0]) return;
  const checks = rows[0].checks + 1;
  const next = nextCheckAt(Number(rows[0].posted_at), Date.now());
  if (m) {
    await db()`UPDATE tweet_scores SET metrics = ${JSON.stringify(m)}::jsonb, score = ${scoreOf(m)}, checks = ${checks}, next_check_at = ${next}
               WHERE tweet_id = ${tweetId}`;
  } else {
    // Deleted or unreadable: keep the last score, stop checking.
    await db()`UPDATE tweet_scores SET checks = ${checks}, next_check_at = NULL WHERE tweet_id = ${tweetId}`;
  }
}

export async function leaderboard() {
  const creators = (await db()`SELECT wallet, count(*)::int AS tweets, coalesce(sum(score), 0)::float AS score
                               FROM tweet_scores GROUP BY wallet ORDER BY score DESC, tweets DESC LIMIT 100`) as
    { wallet: string; tweets: number; score: number }[];
  const tweets = (await db()`SELECT tweet_id, wallet, url, text, posted_at, score::float AS score, metrics, checks, next_check_at IS NULL AS final
                             FROM tweet_scores ORDER BY posted_at DESC LIMIT 50`) as
    { tweet_id: string; wallet: string; url: string; text: string; posted_at: string; score: number; metrics: TweetMetrics | null; checks: number; final: boolean }[];
  return { creators, tweets: tweets.map(t => ({ ...t, posted_at: Number(t.posted_at) })) };
}

/** One creator's total and per-session scores (public, like the leaderboard). */
export async function creatorStats(wallet: string) {
  const rows = (await db()`SELECT session_id, score::float AS score FROM tweet_scores WHERE wallet = ${wallet.toLowerCase()}`) as
    { session_id: string; score: number }[];
  return {
    score: Math.round(rows.reduce((a, r) => a + r.score, 0) * 10) / 10,
    tweets: rows.length,
    bySession: Object.fromEntries(rows.map(r => [r.session_id, r.score])),
  };
}

// ---------- purchase guards ----------

/** Log a purchase attempt and return how many this wallet made in the last
 * `ms` (this one included). Old rows are pruned as we go. */
export async function countAttempt(wallet: string, ms: number): Promise<number> {
  const w = wallet.toLowerCase(), now = Date.now();
  await db()`DELETE FROM attempts WHERE at < ${now - 60 * 60 * 1000}`;
  await db()`INSERT INTO attempts (wallet, at) VALUES (${w}, ${now})`;
  const rows = (await db()`SELECT count(*)::int AS n FROM attempts WHERE wallet = ${w} AND at > ${now - ms}`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/** A purchase that never paid leaves no row behind. */
export async function deleteSession(id: string): Promise<void> {
  await db()`DELETE FROM sessions WHERE id = ${id} AND data->>'status' IN ('unpaid', 'void')`;
}
