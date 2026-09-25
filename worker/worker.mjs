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
import { reviewImagePrompt, reviewTweet, reviewUpload } from "./safety.mjs";
import { generateImage } from "./image.mjs";
import { postTweet, tweetMetrics } from "./twitter.mjs";
import { newClawdTweets, recordInPostedLog, recordXReads, telegram } from "./clawdtwitter.mjs";
import { accountNames, healthy as loginsLeft, summary as loginSummary } from "./accounts.mjs";
import { AGENT_DIR, runClaude } from "./claude.mjs";

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
  if (entry === null) delete l[sessionId];
  else l[sessionId] = entry;
  writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

const X_TIMEOUT_MS = 90_000;
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`no answer from X in ${ms / 1000}s`)), ms))]);
}

// Austin's stop switch: this file exists → no new purchases and no posts
// (paid sessions can still chat, but can't tweet until it's lifted). The
// approval daemon creates or removes it when he says "stop x.larv.ai" /
// "resume x.larv.ai" on Telegram.
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

  if (job.type === "image" && session.images[job.n]?.source === "upload") {
    // An upload: already stored; just vet it.
    const img = session.images[job.n];
    try {
      if (!imageB64) throw new Error("upload missing");
      const v = await reviewUpload(imageB64);
      if (!v.allow) {
        telegram(`🛡️ upload blocked for ${short(session.wallet)}: ${v.reason}`);
        return report({ ...base, n: job.n, ok: false, refused: true, note: `image refused: ${v.reason}` });
      }
      log("upload ok", session.id, job.n);
      return report({ ...base, n: job.n, ok: true });
    } catch (e) {
      log("upload check failed", session.id, e.message);
      return report({ ...base, n: job.n, ok: false, note: "couldn't check that image. Try again" });
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
    if (prior?.inflight) {
      // An earlier attempt reached X and never came back. It may be live —
      // never risk a second copy; a human checks.
      telegram(`⚠️ session ${session.id.slice(0, 6)}: a post attempt timed out and may be live. Check @clawdbotatg. Not retrying.`);
      return report({ ...base, ok: false, note: "your tweet may already be posting. Check @clawdbotatg before trying again." });
    }
    if (prior) return report({ ...base, ok: true, tweetId: prior.id, url: prior.url, text: prior.text });
    if (existsSync(PAUSE_FILE)) return report({ ...base, ok: false, note: "posting is paused right now. Try again in a bit." });

    const g = guardTweet(session.draft);
    if (!g.ok) return report({ ...base, ok: false, note: `can't post: ${g.problems.join("; ")}` });
    const img = session.attachImage !== null ? session.images[session.attachImage] : null;
    if (img && !imageB64) return report({ ...base, ok: false, note: "couldn't load the attached image — detach it or try again" });

    let v;
    try {
      v = await reviewTweet(g.text, img ? imageB64 : null, img && img.source !== "upload" ? img.prompt : null);
    } catch (e) {
      log("review failed", session.id, e.message);
      return report({ ...base, ok: false, note: "the safety check didn't run — try again" });
    }
    if (!v.allow) {
      log("post BLOCKED", session.id, v.reason);
      telegram(`🛡️ tweet blocked for ${short(session.wallet)}: ${v.reason}\n\n${g.text}`);
      return report({ ...base, ok: false, note: `blocked by the safety check: ${v.reason} — ask clawd for a different take.` });
    }

    // Mark it in flight BEFORE calling X: if we never hear back, no retry
    // (from this session or a re-queued job) can post it twice.
    recordPost(session.id, { inflight: true, at: Date.now() });
    try {
      const t = await withTimeout(postTweet(g.text, img ? imageB64 : null), X_TIMEOUT_MS);
      recordPost(session.id, { id: t.id, url: t.url, text: g.text, wallet: session.wallet, at: Date.now() });
      log("POSTED", session.id, t.url);
      const dry = process.env.DRY_RUN_POST === "1";
      // No tweet text here: clawd-twitter's fully-tooled agents read this log, and the
      // text was steered by a stranger. Ids and numbers only.
      if (!dry) recordInPostedLog({ id: t.id, url: t.url, wallet: session.wallet, cv: session.pricePaid });
      telegram(`${dry ? "[dry run] " : ""}🦞 ${short(session.wallet)} posted (${Number(session.pricePaid).toLocaleString("en-US")} CV)\n${t.url}`);
      return report({ ...base, ok: true, tweetId: t.id, url: t.url, text: g.text });
    } catch (e) {
      log("post failed", session.id, e.message);
      if (e.data || typeof e.code === "number") { // an HTTP error response from X (not ECONNRESET etc.)
        // X answered with an error: nothing posted, safe to try again.
        recordPost(session.id, null);
        return report({ ...base, ok: false, note: `X rejected the post: ${String(e.data?.detail || e.message).slice(0, 200)}` });
      }
      // Timeout / network: it may have landed. Keep the in-flight mark.
      telegram(`⚠️ session ${session.id.slice(0, 6)}: X didn't answer (${e.message}). The tweet may be live. Check @clawdbotatg.`);
      return report({ ...base, ok: false, note: "X didn't answer. Your tweet may be live. Check @clawdbotatg before trying again." });
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

// Graceful restart: on SIGTERM stop claiming, let in-flight jobs finish
// (launchd's ExitTimeOut gives us 5 minutes), then exit. A kill mid-job used
// to strand a paying user's turn until the 6-minute timeout.
let stopping = false;
process.on("SIGTERM", async () => {
  if (stopping) return;
  stopping = true;
  log(`SIGTERM: finishing ${running} job(s), then exiting`);
  while (running > 0) await sleep(500);
  log("drained, exiting");
  process.exit(0);
});

// Creator scores: every 5 minutes, read engagement for paid tweets that are
// due (the site decides when: lib/score.ts nextCheckAt) and hand it back.
const SCORE_EVERY_MS = 5 * 60 * 1000;
let lastScore = 0;
async function scoreTweets() {
  if (Date.now() - lastScore < SCORE_EVERY_MS) return;
  lastScore = Date.now();
  try {
    let { due } = await api("/api/worker/scores", {});
    if (!due.length || process.env.DRY_RUN_POST === "1") return;
    const { metrics, read } = await tweetMetrics(due);
    recordXReads(read);
    await api("/api/worker/scores", { results: metrics });
    log(`scored ${due.length} tweet(s)`);
  } catch (e) {
    log("scoring failed", e.message);
  }
}

// Claude health. A tiny test call every 10 minutes (every 2 while down), so a
// dead login is found here — not by someone who just burned CV. While no
// login works the worker reports unhealthy and the site stops selling; when
// Claude comes back, live sessions get the lost minutes back.
let claudeOk = true, downSince = 0, lastProbe = 0;
async function probeClaude() {
  const every = claudeOk ? 10 * 60 * 1000 : 2 * 60 * 1000;
  if (Date.now() - lastProbe < every || running > 0) return;
  lastProbe = Date.now();
  let ok = false;
  try {
    ok = /ok/i.test(await runClaude(join(AGENT_DIR, "PING.md"), "health check"));
  } catch (e) {
    log("claude probe failed", e.message);
  }
  ok = ok && loginsLeft();
  if (ok === claudeOk) return;
  claudeOk = ok;
  if (!ok) {
    downSince = Date.now();
    log("CLAUDE DOWN", loginSummary());
    telegram(`🔴 no Claude login works. x.larv.ai stopped selling sessions.\n${loginSummary()}`);
  } else {
    const lost = Date.now() - downSince;
    log("claude back after", Math.round(lost / 1000), "s");
    try {
      const { extended } = await api("/api/worker/extend", { ms: lost });
      telegram(`🟢 Claude is back (down ${Math.round(lost / 60000)} min). x.larv.ai is selling again; ${extended} live session(s) got the time back.`);
    } catch (e) {
      log("extend failed", e.message);
    }
  }
}

async function poll() {
  newClawdTweets(); // prime the offset: start at the end of the log
  for (;;) {
    if (stopping) { await sleep(1000); continue; }
    await watchClawdTweets();
    await scoreTweets();
    await probeClaude();
    if (running >= CONCURRENCY) { await sleep(500); continue; }
    let claimed;
    try {
      claimed = await api("/api/worker/claim", { paused: existsSync(PAUSE_FILE), healthy: claudeOk && loginsLeft() });
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

log(`worker up → ${API} (${CONCURRENCY} at a time) · Claude logins: ${accountNames().join(", ") || "default"}`);
poll();
