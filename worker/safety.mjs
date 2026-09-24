// The model half of safety: an independent, tool-less reviewer that sees only
// the final text (it never saw the conversation that may have manipulated
// the drafting agent). Fails CLOSED — anything but a clean "allow" blocks.
import { join } from "path";
import { AGENT_DIR, runClaude } from "./claude.mjs";
import { guardFreeText } from "./guard.mjs";

const SYSTEM = join(AGENT_DIR, "REVIEWER.md");

export function parseVerdict(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return { allow: false, reason: "the safety check didn't give a clear answer" };
  try {
    const d = JSON.parse(m[0]);
    const reason = typeof d.reason === "string" ? d.reason.slice(0, 300) : "";
    const verdict = { allow: d.verdict === "allow", reason: reason || (d.verdict === "allow" ? "" : "blocked by the safety check") };
    // Words inside an image get the same link/address rules as the tweet.
    const problems = guardFreeText(typeof d.image_text === "string" ? d.image_text : "");
    if (verdict.allow && problems.length) return { allow: false, reason: `the image contains ${problems[0]}` };
    return verdict;
  } catch {
    return { allow: false, reason: "the safety check didn't give a clear answer" };
  }
}

/** The final gate: the exact text, and the exact image bytes that will post. */
export async function reviewTweet(text, imageB64, imagePrompt) {
  const body = [
    "TWEET (exact text that will post):",
    "<<<",
    text,
    ">>>",
    imageB64
      ? `\nThe image above will be ATTACHED to this tweet.${imagePrompt ? ` It was AI-generated from this prompt:\n<<<\n${imagePrompt}\n>>>` : " It was uploaded by the person."}`
      : "\n(no image)",
  ].join("\n");
  return parseVerdict(await runClaude(SYSTEM, body, undefined, imageB64 ? [imageB64] : []));
}

/** An uploaded image, vetted before it can be attached. */
export async function reviewUpload(imageB64) {
  const body = "IMAGE uploaded by the person (above), to attach to a tweet from @clawdbotatg. Judge the image.";
  return parseVerdict(await runClaude(SYSTEM, body, undefined, [imageB64]));
}

export async function reviewImagePrompt(prompt, withClawd) {
  const body = [
    `IMAGE PROMPT (to be generated${withClawd ? ", featuring the clawd lobster character" : ""} and possibly attached to a tweet):`,
    "<<<",
    prompt,
    ">>>",
  ].join("\n");
  return parseVerdict(await runClaude(SYSTEM, body));
}
