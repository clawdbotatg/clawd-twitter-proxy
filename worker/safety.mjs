// The model half of safety: an independent, tool-less reviewer that sees only
// the final text (it never saw the conversation that may have manipulated
// the drafting agent). Fails CLOSED — anything but a clean "allow" blocks.
import { join } from "path";
import { AGENT_DIR, runClaude } from "./claude.mjs";

const SYSTEM = join(AGENT_DIR, "REVIEWER.md");

export function parseVerdict(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return { allow: false, reason: "the safety check didn't give a clear answer" };
  try {
    const d = JSON.parse(m[0]);
    const reason = typeof d.reason === "string" ? d.reason.slice(0, 300) : "";
    return { allow: d.verdict === "allow", reason: reason || (d.verdict === "allow" ? "" : "blocked by the safety check") };
  } catch {
    return { allow: false, reason: "the safety check didn't give a clear answer" };
  }
}

export async function reviewTweet(text, imagePrompt) {
  const body = [
    "TWEET (exact text that will post):",
    "<<<",
    text,
    ">>>",
    imagePrompt ? `\nATTACHED IMAGE was generated from this prompt:\n<<<\n${imagePrompt}\n>>>` : "\n(no image)",
  ].join("\n");
  return parseVerdict(await runClaude(SYSTEM, body));
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
