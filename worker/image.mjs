// gpt-image via OpenAI. With the clawd toggle on, it's an EDIT of clawd's
// reference portrait (same template clawd-twitter's gm-image.js uses, so the
// character stays recognizable); otherwise a plain generation.
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { AGENT_DIR } from "./claude.mjs";

const MODEL = process.env.IMAGE_MODEL || "gpt-image-2";
const REF = join(AGENT_DIR, "clawd-ref.jpg");

function clawdPrompt(scene) {
  return (
    `Take this character — a red crystalline/geometric Pepe-style creature with an ` +
    `ethereum diamond-shaped head, wearing a black tuxedo with bow tie, holding a ` +
    `teacup — and put it in this scene: ${scene}. Keep the same art style (clean ` +
    `anime/cartoon illustration, bold outlines). Keep the character recognizable. Square format.`
  );
}

/** Returns base64 JPEG (PNG from the API, recompressed to keep the stored copy small). */
export async function generateImage(prompt, withClawd) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("image generation isn't configured");
  let res;
  if (withClawd) {
    const form = new FormData();
    form.append("model", MODEL);
    form.append("prompt", clawdPrompt(prompt));
    form.append("size", "1024x1024");
    form.append("quality", "high");
    form.append("image", new Blob([readFileSync(REF)], { type: "image/jpeg" }), "clawd.jpg");
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
    });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt, size: "1024x1024", quality: "high" }),
    });
  }
  const json = await res.json().catch(() => ({}));
  const b64 = json.data?.[0]?.b64_json;
  if (!res.ok || !b64) {
    const err = new Error(json.error?.message || `image API ${res.status}`);
    // OpenAI's own moderation said no — report as a refusal, not a crash.
    err.refused = json.error?.code === "moderation_blocked" || /safety|moderation/i.test(json.error?.message || "");
    throw err;
  }
  return toJpeg(b64);
}

function toJpeg(pngB64) {
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const src = join(tmpdir(), `btt-${stamp}.png`), dst = join(tmpdir(), `btt-${stamp}.jpg`);
  writeFileSync(src, Buffer.from(pngB64, "base64"));
  try {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "85", src, "--out", dst], { stdio: "ignore" });
    return readFileSync(dst).toString("base64");
  } finally {
    for (const f of [src, dst]) try { unlinkSync(f); } catch {}
  }
}
