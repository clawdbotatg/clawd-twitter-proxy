// Everything we borrow from clawd-twitter (../clawd-twitter): today's context,
// its posted-log, and its Telegram bot. We never call its scripts: tg-send.js
// snapshots state/pending.json as "what Austin saw", and a send from here
// could make the approval daemon think Austin saw a draft he didn't.
import { readFileSync, writeFileSync, statSync, appendFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export const CT_ROOT = process.env.CLAWD_TWITTER_DIR || join(homedir(), "clawd-harness/projects/clawd-twitter");
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- Telegram: straight to the Bot API ----------

export async function telegram(text) {
  const token = process.env.TELEGRAM_TWEET_BOT_TOKEN, chat = process.env.TELEGRAM_AUSTIN_ID;
  if (!token || !chat) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: `x.larv.ai · ${text}`, disable_web_page_preview: false }),
    });
    if (!res.ok) log("telegram failed", res.status);
  } catch (e) {
    log("telegram failed", e.message);
  }
}

// ---------- the shared X read budget ----------
// X bills per post read. clawd-twitter paces its feed pulls against a monthly
// ledger (lib/feed.js); our metric reads go into the same ledger, same shape,
// so its pacing sees them.

export function recordXReads(count) {
  if (!count) return;
  const f = join(CT_ROOT, "state/usage-ledger.json");
  try {
    const ledger = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
    const d = new Date(), p = n => String(n).padStart(2, "0");
    const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, month = day.slice(0, 7);
    ledger[month] = (ledger[month] || 0) + count;
    ledger[day] = (ledger[day] || 0) + count;
    writeFileSync(f, JSON.stringify(ledger, null, 2));
  } catch (e) {
    log("usage-ledger update failed", e.message);
  }
}

// ---------- the shared posted-log ----------

export function recordInPostedLog(entry) {
  try {
    appendFileSync(join(CT_ROOT, "state/posted-log.jsonl"), JSON.stringify({ at: new Date().toISOString(), kind: "burn-to-tweet", ...entry }) + "\n");
  } catch (e) {
    log("posted-log append failed", e.message);
  }
}

// ---------- today's context for clawd ----------
// The morning brief's trend clusters (from Austin's home timeline). Third-party
// text: it's handed to clawd as reference, never as instructions, and the
// reviewer still gates whatever comes out.

let cache = { mtime: 0, text: "" };

export function todaysContext() {
  const f = join(CT_ROOT, "state/morning-brief.json");
  if (!existsSync(f)) return "";
  try {
    const mtime = statSync(f).mtimeMs;
    if (mtime === cache.mtime) return cache.text;
    const brief = JSON.parse(readFileSync(f, "utf8"));
    const when = new Date(mtime).toISOString().slice(0, 10);
    const lines = [`What's being talked about on crypto/AI twitter (Austin's timeline, ${when}):`];
    for (const t of (brief.trends || []).slice(0, 10)) {
      lines.push(`- "${t.term}" (${t.tweets} tweets)`);
      for (const s of (t.samples || []).slice(0, 2)) {
        lines.push(`    @${s.author}: ${String(s.text).replace(/\s+/g, " ").replace(/https:\/\/t\.co\/\S+/g, "").slice(0, 220)}`);
      }
    }
    cache = { mtime, text: lines.join("\n") };
    return cache.text;
  } catch (e) {
    log("context read failed", e.message);
    return "";
  }
}

// ---------- any clawd tweet resets the price ----------
// Every post clawd-twitter makes (gm thread, nightly, desk-approved tweets)
// lands in state/posted-log.jsonl. Tail it: a new line that isn't one of ours
// means clawd just tweeted, so the auction restarts. Starts at the end of the
// file — history never triggers a reset.

const POSTED_LOG = join(CT_ROOT, "state/posted-log.jsonl");
let offset = null;

export function newClawdTweets() {
  try {
    const size = statSync(POSTED_LOG).size;
    if (offset === null || size < offset) { offset = size; return []; }
    if (size === offset) return [];
    const buf = readFileSync(POSTED_LOG).subarray(offset, size).toString("utf8");
    const done = buf.lastIndexOf("\n");
    if (done < 0) return []; // half-written line — wait for the rest
    offset += Buffer.byteLength(buf.slice(0, done + 1));
    const out = [];
    for (const line of buf.slice(0, done).split("\n")) {
      try {
        const e = JSON.parse(line);
        if (e.kind === "burn-to-tweet") continue;
        out.push({ at: Date.parse(e.at) || Date.now(), url: e.url, kind: e.kind });
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}
