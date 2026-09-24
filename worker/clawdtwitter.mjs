// Everything we borrow from clawd-twitter (../clawd-twitter): today's context,
// its posted-log, and its Telegram bot. We never call its scripts: tg-send.js
// snapshots state/pending.json as "what Austin saw", and a send from here
// could make the approval daemon think Austin saw a draft he didn't.
import { readFileSync, statSync, appendFileSync, existsSync } from "fs";
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
