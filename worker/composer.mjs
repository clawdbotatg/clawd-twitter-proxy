// Post through X's own web composer, in the Chrome profile signed in as
// @clawdbotatg. Needed for $CLAWD: X attaches the token + chart only when the
// cashtag is PICKED from the composer's dropdown. The API has no way to do it
// ("base:<address>" in API text links the ticker but shows no chart).
//
// Fails closed: if our token isn't in the dropdown, or the box doesn't hold
// exactly the tweet, nothing is posted (err.notPosted). Only after the Post
// click is the outcome uncertain.
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import { CLAWD_TOKEN } from "./guard.mjs";

const CDP = process.env.CLAWD_CHROME_CDP || "http://127.0.0.1:18800";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = process.env.CLAWD_CHROME_PROFILE || `${process.env.HOME}/.openclaw/browser/openclaw/user-data`;
const CASHTAG_RE = /\$CLAWD\b/gi;
// The dropdown shows the address shortened: "0x9f86…6b07".
const OURS = [CLAWD_TOKEN.slice(0, 6), CLAWD_TOKEN.slice(-4)];

export const needsComposer = text => /\$CLAWD\b/i.test(text);

function notPosted(msg) {
  const e = new Error(msg);
  e.notPosted = true;
  return e;
}

async function connect() {
  try {
    return await chromium.connectOverCDP(CDP);
  } catch {}
  // Same launch as the credential store's; detached so a worker restart doesn't kill it.
  const port = new URL(CDP).port;
  spawn(CHROME, [`--user-data-dir=${PROFILE}`, "--profile-directory=Default", `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*", "--no-first-run"],
  { detached: true, stdio: "ignore", env: { HOME: process.env.HOME, PATH: "/usr/bin:/bin", USER: process.env.USER } }).unref();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      return await chromium.connectOverCDP(CDP);
    } catch {}
  }
  throw notPosted("clawd's browser didn't start");
}

// One composer at a time: they'd fight over focus and the dropdown.
let chain = Promise.resolve();
export function composerPost(text, jpegB64) {
  const run = chain.then(() => post(text, jpegB64));
  chain = run.catch(() => {});
  return run;
}

const flat = s => s.replace(/\s+/g, " ").trim();

async function post(text, jpegB64) {
  const browser = await connect();
  const page = await browser.contexts()[0].newPage();
  try {
    await page.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded", timeout: 30_000 });
    const dialog = page.locator('[role="dialog"]');
    const box = dialog.locator('[data-testid="tweetTextarea_0"]');
    try {
      await box.waitFor({ timeout: 20_000 });
    } catch {
      throw notPosted("X's composer didn't open (is @clawdbotatg still signed in?)");
    }
    await box.click();

    // Every keystroke must land in the editor. Anywhere else, X reads them as
    // shortcuts (l = like, t = repost, …), so stop the moment focus leaves it.
    const type = async (str, delay) => {
      if (!(await box.evaluate(el => el.contains(document.activeElement)))) throw notPosted("lost focus in X's composer");
      await page.keyboard.type(str, { delay });
    };
    const parts = text.split(CASHTAG_RE);
    for (let i = 0; i < parts.length; i++) {
      let seg = parts[i];
      // The pick leaves a trailing space: reuse it, or drop it before punctuation.
      if (i > 0 && seg.startsWith(" ")) seg = seg.slice(1);
      else if (i > 0 && seg && !/^\s/.test(seg)) await page.keyboard.press("Backspace");
      if (seg) await type(seg, 15);
      if (i === parts.length - 1) break;
      await type("$CLAWD", 60);
      const rows = page.locator(`#${await box.getAttribute("aria-controls")} [data-testid="typeaheadResult"]`);
      try {
        await rows.first().waitFor({ timeout: 10_000 });
      } catch {
        throw notPosted("X's cashtag picker didn't open for $CLAWD");
      }
      await page.waitForTimeout(500); // let the list settle before reading it
      const idx = (await rows.allInnerTexts()).findIndex(t => t.includes(OURS[0]) && t.includes(OURS[1]));
      if (idx < 0) throw notPosted("our $CLAWD (Base 0x9f86…6b07) isn't in X's cashtag picker");
      // Pick with the keyboard: clicking the row can pull focus out of the editor.
      for (let k = 0; k < idx; k++) await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
    }

    // The pick attaches the token's chart card; that card is the whole point.
    if (parts.length > 1) {
      try {
        await dialog.locator('[aria-label="Cashtag attachments"]').filter({ hasText: "clawd.atg.eth" }).first().waitFor({ timeout: 10_000 });
      } catch {
        throw notPosted("X didn't attach the $CLAWD chart");
      }
    }

    const typed = await box.innerText();
    if (flat(typed) !== flat(text.replace(CASHTAG_RE, "$CLAWD"))) throw notPosted(`the composer didn't take the text cleanly (got: ${flat(typed).slice(0, 80)})`);

    if (jpegB64) {
      // The chart card has its own logo <img>; count past it.
      const imgs = dialog.locator('[data-testid="attachments"] img');
      const before = await imgs.count();
      await dialog.locator('input[data-testid="fileInput"]').setInputFiles({ name: "clawd.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpegB64, "base64") });
      try {
        await page.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length > n,
          ['[role="dialog"] [data-testid="attachments"] img', before], { timeout: 30_000 });
      } catch {
        throw notPosted("the image didn't attach in X's composer");
      }
    }

    const button = dialog.locator('[data-testid="tweetButton"]');
    try {
      await page.waitForFunction(el => el && el.getAttribute("aria-disabled") !== "true", await button.elementHandle(), { timeout: 30_000 });
    } catch {
      throw notPosted("X's Post button stayed disabled");
    }

    if (process.env.DRY_RUN_POST === "1") {
      if (process.env.COMPOSER_SHOT) await page.screenshot({ path: process.env.COMPOSER_SHOT });
      const id = `dry${Date.now()}`;
      return { id, url: `https://x.com/clawdbotatg/status/${id}` };
    }

    const created = page.waitForResponse(r => r.url().includes("/CreateTweet"), { timeout: 45_000 });
    await button.click();
    const res = await created; // throws on timeout: outcome unknown, not marked notPosted
    const body = await res.text().catch(() => "");
    let json = null;
    try { json = JSON.parse(body); } catch {}
    const id = json?.data?.create_tweet?.tweet_results?.result?.rest_id || body.match(/"rest_id":"(\d+)"/)?.[1];
    if (!id) {
      // Only a clear error with no tweet data means nothing posted. Anything
      // else is unknown: the caller keeps the in-flight mark (no double post).
      if (json?.errors?.length && !json?.data?.create_tweet) throw notPosted(json.errors[0].message || "X refused the post");
      throw new Error(`X answered ${res.status()} but no tweet id came back. It may be live`);
    }
    return { id, url: `https://x.com/clawdbotatg/status/${id}` };
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => {});
    await browser.close().catch(() => {}); // disconnects; the browser keeps running
  }
}
