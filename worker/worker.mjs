#!/usr/bin/env node
// burn-to-tweet worker — runs on the Mac (claude -p needs the subscription).
// Outbound-only: pulls jobs from the site's API, never listens on a port.
//
//   turn   → clawd (isolated claude -p) replies + drafts
//   image  → reviewer checks the prompt → gpt-image → JPEG back to the site
//   post   → guard + reviewer on the exact text → post as @clawdbotatg
import "./env.mjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runTurn } from "./agent.mjs";
import { guardTweet } from "./guard.mjs";
import { reviewImagePrompt, reviewTweet } from "./safety.mjs";
import { generateImage } from "./image.mjs";
import { postTweet } from "./twitter.mjs";
import { newClawdTweets, recordInPostedLog, telegram } from "./clawdtwitter.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE = join(HERE, "state");
mkdirSync(STATE, { recursive: true });

const API = (process.env.API_BASE || "").replace(/\/$/, "");
const SECRET = process.env.WORKER_SECRET;
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 3);
if (!API || !SECRET) {
  console.error("worker: set API_BASE and WORKER_SECRET in worker/.env");
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Results must land: a posted tweet the site never hears about would let
 * the buyer post again. Retry for up to ~15 minutes. */
async function report(result) {
  for (let i = 0; ; i++) {
    try {
      return await api("/api/worker/result", result);
    } catch (e) {
      if (i >= 60) { log("GAVE UP reporting", result.type, result.sessionId, e.message); return; }
      await sleep(15_000);
    }
  }
}

// Ledger of posted sessions: a session posts at most once, ever — even if the
// site re-issues the job because our first report was lost.
const LEDGER = join(STATE, "posted.json");
function ledger() {
  try { return existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : {}; } catch { return {}; }
}
function recordPost(sessionId, entry) {
  const l = ledger();
  l[sessionId] = entry;
  writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

// Austin's stop switch: this file exists → the site takes no new purchases.
// Paid sessions still get served. The approval daemon creates or removes it
// when he says "stop x.larv.ai" / "resume x.larv.ai" on Telegram.
export const PAUSE_FILE = join(STATE, "PAUSED");
const short = w => `${w.slice(0, 6)}…${w.slice(-4)}`;

async function handle({ job, session, imageB64, maxTurns }) {
  const base = { jobId: job.jobId, sessionId: job.sessionId, type: job.type };

  if (job.type === "turn") {
    try {
      const r = await runTurn(session, maxTurns ?? 12);
      log("turn", session.id, r.draft ? `draft ${r.draft.length}c` : "no draft");
      return report({ ...base, ok: true, reply: r.reply, draft: r.draft, imageIdea: r.imageIdea });
    } catch (e) {
      log("turn failed", session.id, e.message);
      return report({ ...base, ok: false, note: "clawd hit a snag — that turn wasn't counted, try again." });
    }
  }

  if (job.type === "image") {
    const img = session.images[job.n];
    try {
      const v = await reviewImagePrompt(img.prompt, img.withClawd);
      if (!v.allow) {
        telegram(`🛡️ image blocked for ${short(session.wallet)}: ${v.reason}\nprompt: ${img.prompt.slice(0, 200)}`);
        return report({ ...base, n: job.n, ok: false, refused: true, note: `image refused: ${v.reason}` });
      }
      const b64 = await generateImage(img.prompt, img.withClawd);
      log("image", session.id, job.n, `${Math.round(b64.length / 1365)}KB`);
      return report({ ...base, n: job.n, ok: true, b64 });
    } catch (e) {
      log("image failed", session.id, e.message);
      return report({ ...base, n: job.n, ok: false, refused: !!e.refused, note: e.refused ? "image refused by the image model's safety filter" : "image generation failed — try again" });
    }
  }

  if (job.type === "post") {
    const prior = ledger()[session.id];
    if (prior) return report({ ...base, ok: true, tweetId: prior.id, url: prior.url, text: prior.text });

    const g = guardTweet(session.draft);
    if (!g.ok) return report({ ...base, ok: false, note: `can't post: ${g.problems.join("; ")}` });
    const img = session.attachImage !== null ? session.images[session.attachImage] : null;
    if (img && !imageB64) return report({ ...base, ok: false, note: "couldn't load the attached image — detach it or try again" });

    let v;
    try {
      v = await reviewTweet(g.text, img?.prompt);
    } catch (e) {
      log("review failed", session.id, e.message);
      return report({ ...base, ok: false, note: "the safety check didn't run — try again" });
    }
    if (!v.allow) {
      log("post BLOCKED", session.id, v.reason);
      telegram(`🛡️ tweet blocked for ${short(session.wallet)}: ${v.reason}\n\n${g.text}`);
      return report({ ...base, ok: false, note: `blocked by the safety check: ${v.reason} — ask clawd for a different take.` });
    }

    try {
      const t = await postTweet(g.text, img ? imageB64 : null);
      recordPost(session.id, { id: t.id, url: t.url, text: g.text, wallet: session.wallet, at: Date.now() });
      log("POSTED", session.id, t.url);
      const dry = process.env.DRY_RUN_POST === "1";
      if (!dry) recordInPostedLog({ id: t.id, url: t.url, text: g.text, wallet: session.wallet, cv: session.pricePaid });
      telegram(`${dry ? "[dry run] " : ""}🦞 ${short(session.wallet)} posted (${Number(session.pricePaid).toLocaleString("en-US")} CV)\n${t.url}`);
      return report({ ...base, ok: true, tweetId: t.id, url: t.url, text: g.text });
    } catch (e) {
      log("post failed", session.id, e.message);
      return report({ ...base, ok: false, note: `X rejected the post: ${String(e.data?.detail || e.message).slice(0, 200)}` });
    }
  }
}

// One poller feeds a bounded pool. Idle it polls every IDLE_POLL_MS; while
// the site reports someone mid-session ("hot") it polls every second.
const IDLE_POLL_MS = Number(process.env.IDLE_POLL_MS || 20_000);
let running = 0;

// clawd tweeted outside this site → restart the auction (checked every loop; a
// file stat is free).
async function watchClawdTweets() {
  const fresh = newClawdTweets();
  if (!fresh.length) return;
  const at = Math.max(...fresh.map(t => t.at));
  try {
    await api("/api/worker/reset", { at });
    log("price reset: clawd tweeted", fresh.map(t => `${t.kind} ${t.url}`).join(", "));
  } catch (e) {
    log("price reset failed", e.message);
  }
}

async function poll() {
  newClawdTweets(); // prime the offset: start at the end of the log
  for (;;) {
    await watchClawdTweets();
    if (running >= CONCURRENCY) { await sleep(500); continue; }
    let claimed;
    try {
      claimed = await api("/api/worker/claim", { paused: existsSync(PAUSE_FILE) });
    } catch (e) {
      log("claim failed", e.message);
      await sleep(10_000);
      continue;
    }
    for (const e of claimed.events || []) telegram(e);
    if (!claimed.job) { await sleep(claimed.hot ? 1000 : IDLE_POLL_MS); continue; }
    running++;
    handle(claimed)
      .catch(e => log("job crashed", claimed.job.type, e.message))
      .finally(() => { running--; });
  }
}

log(`worker up → ${API} (${CONCURRENCY} at a time)`);
poll();
