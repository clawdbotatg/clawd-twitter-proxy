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

/** The final gate: the exact text, and the exact image bytes that will post.
 * `video` ({frames, transcript, prompt}) instead of an image: the frames are
 * sampled from the exact mp4 that will post. */
export async function reviewTweet(text, imageB64, imagePrompt, video = null) {
  const body = [
    "TWEET (exact text that will post):",
    "<<<",
    text,
    ">>>",
    video
      ? `\nA VIDEO will be ATTACHED to this tweet. ${videoBrief(video)}`
      : imageB64
        ? `\nThe image above will be ATTACHED to this tweet.${imagePrompt ? ` It was AI-generated from this prompt:\n<<<\n${imagePrompt}\n>>>` : " It was uploaded by the person."}`
        : "\n(no image)",
  ].join("\n");
  const v = parseVerdict(await runClaude(SYSTEM, body, undefined, video ? video.frames : imageB64 ? [imageB64] : []));
  return video ? withSpokenWords(v, video.transcript) : v;
}

function videoBrief({ frames, transcript, prompt }) {
  return [
    `The ${frames.length} images above are frames from it, in order (one every few seconds, plus every scene cut).`,
    prompt ? `It was AI-generated from this prompt:\n<<<\n${prompt}\n>>>` : "It was uploaded by the person.",
    "Everything said in its audio (machine transcript):",
    "<<<",
    transcript || "(no speech)",
    ">>>",
  ].join("\n");
}

// Spoken words get the same link/address rules as the tweet (fails closed).
function withSpokenWords(v, transcript) {
  const problems = guardFreeText(transcript || "");
  if (v.allow && problems.length) return { allow: false, reason: `the video's audio ${problems[0].replace(/^contains /, "mentions ")}` };
  return v;
}

/** A video (generated or uploaded), vetted before it can be attached. */
export async function reviewVideo(video) {
  const body = `VIDEO to attach to a tweet from @clawdbotatg. ${videoBrief(video)}\nJudge the video: every frame and everything said.`;
  return withSpokenWords(parseVerdict(await runClaude(SYSTEM, body, undefined, video.frames)), video.transcript);
}

/** An uploaded image, vetted before it can be attached. */
export async function reviewUpload(imageB64) {
  const body = "IMAGE uploaded by the person (above), to attach to a tweet from @clawdbotatg. Judge the image.";
  return parseVerdict(await runClaude(SYSTEM, body, undefined, [imageB64]));
}

export async function reviewImagePrompt(prompt, withClawd, kind = "image") {
  const body = [
    `${kind === "video" ? "VIDEO" : "IMAGE"} PROMPT (to be generated${withClawd ? ", featuring the clawd lobster character" : ""} and possibly attached to a tweet):`,
    "<<<",
    prompt,
    ">>>",
  ].join("\n");
  return parseVerdict(await runClaude(SYSTEM, body));
}
