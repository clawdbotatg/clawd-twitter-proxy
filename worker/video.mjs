// Video: Grok Imagine generation, and the re-encode every video goes through
// (generated or uploaded) before review. The re-encode is the file that gets
// reviewed AND the file that posts: frames for the reviewer come from it, its
// sha256 is pinned on the session, and the post re-checks the hash.
import { createHash } from "crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { tmpdir } from "os";
import { put } from "@vercel/blob/client";
import { generateImage } from "./image.mjs";

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG || "/opt/homebrew/bin/ffmpeg";
const FFPROBE = process.env.FFPROBE || "/opt/homebrew/bin/ffprobe";
const XAI_MODEL = process.env.XAI_VIDEO_MODEL || "grok-imagine-video-1.5";
const SECONDS = Number(process.env.XAI_VIDEO_SECONDS || 8);
/** X's limit for a normal account (lib/limits.ts MAX_VIDEO_SECONDS). */
export const MAX_SECONDS = 140;
/** Frames the reviewer sees: one every few seconds plus every scene cut. */
const MAX_FRAMES = 16;

const sleep = ms => new Promise(r => setTimeout(r, ms));
export const sha256 = buf => createHash("sha256").update(buf).digest("hex");

function notUsable(msg) {
  const e = new Error(msg);
  e.userNote = msg;
  return e;
}

export async function download(url, maxBytes = 512 * 1024 * 1024) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw notUsable("that video is too large");
  return buf;
}

// ---------- Grok Imagine ----------

/** prompt → mp4 bytes. With clawd, gpt-image paints the opening frame first
 * (from clawd's reference portrait, same as images) and Grok animates it. */
export async function generateVideo(prompt, withClawd) {
  const key = process.env.XAI_API_KEY;
  if (!key) throw notUsable("video generation isn't switched on yet. Upload one instead");
  const body = { model: XAI_MODEL, prompt, duration: SECONDS };
  if (withClawd) body.image = { url: `data:image/jpeg;base64,${await generateImage(prompt, true)}` };
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const start = await fetch("https://api.x.ai/v1/videos/generations", { method: "POST", headers, body: JSON.stringify(body) });
  const started = await start.json().catch(() => ({}));
  if (!start.ok || !started.request_id) throw xaiError(started, start.status);
  for (let i = 0; i < 60; i++) { // ≤5 min
    await sleep(5_000);
    const res = await fetch(`https://api.x.ai/v1/videos/${started.request_id}`, { headers: { Authorization: headers.Authorization } });
    const d = await res.json().catch(() => ({}));
    if (d.status === "done" && d.video?.url) return download(d.video.url);
    if (d.status === "failed" || d.status === "expired" || (!res.ok && res.status !== 404)) throw xaiError(d, res.status);
  }
  throw new Error("Grok took too long");
}

function xaiError(d, status) {
  const msg = String(d?.error?.message || d?.error || d?.message || `xAI ${status}`).slice(0, 200);
  const e = new Error(msg);
  // Grok's own moderation said no: a refusal, not a crash.
  e.refused = /moderat|policy|safety|content/i.test(msg);
  return e;
}

// ---------- re-encode + frames + transcript ----------

async function probe(file) {
  try {
    const { stdout } = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file]);
    const d = JSON.parse(stdout);
    return { seconds: Number(d.format?.duration) || 0, video: d.streams?.some(s => s.codec_type === "video"), audio: d.streams?.some(s => s.codec_type === "audio") };
  } catch {
    throw notUsable("that file isn't a video we can read");
  }
}

/** Raw bytes (any container X might choke on, any metadata) → ≤1280px H.264
 * + AAC mp4 with no metadata, plus the reviewer's frames and the transcript. */
export async function prepareVideo(raw) {
  const dir = mkdtempSync(join(tmpdir(), "btt-video-"));
  try {
    const src = join(dir, "in"), out = join(dir, "out.mp4");
    writeFileSync(src, raw);
    const p = await probe(src);
    if (!p.video) throw notUsable("that file has no video in it");
    if (p.seconds > MAX_SECONDS) throw notUsable(`that video is ${Math.round(p.seconds)}s, X takes up to ${MAX_SECONDS}s`);
    await run(FFMPEG, [
      "-y", "-v", "error", "-i", src,
      "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "-1", "-map_chapters", "-1",
      "-vf", "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", "-fpsmax", "30",
      "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "23", "-maxrate", "5M", "-bufsize", "10M",
      "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100",
      "-movflags", "+faststart", out,
    ], { timeout: 4 * 60 * 1000 });
    const mp4 = readFileSync(out);
    const q = await probe(out);
    return { mp4, sha256: sha256(mp4), seconds: Math.round(q.seconds * 10) / 10, frames: await framesOf(out, q.seconds, dir), transcript: q.audio ? await transcribe(out, dir) : "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Frames from an mp4 already on disk: one every `step` seconds and every scene cut. */
async function framesOf(file, seconds, dir) {
  const step = Math.max(1, seconds / 10);
  await run(FFMPEG, [
    "-v", "error", "-i", file,
    "-vf", `select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,${step.toFixed(2)})+gt(scene\\,0.4)',scale=640:-2`,
    "-fps_mode", "vfr", "-frames:v", String(MAX_FRAMES), "-q:v", "4", join(dir, "f%03d.jpg"),
  ], { timeout: 2 * 60 * 1000 });
  const frames = readdirSync(dir).filter(f => /^f\d+\.jpg$/.test(f)).sort().map(f => readFileSync(join(dir, f)).toString("base64"));
  if (!frames.length) throw new Error("no frames came out of the video");
  return frames;
}

/** The reviewed mp4 again (at post time): frames for the final review. */
export async function framesFromMp4(mp4) {
  const dir = mkdtempSync(join(tmpdir(), "btt-video-"));
  try {
    const f = join(dir, "v.mp4");
    writeFileSync(f, mp4);
    return await framesOf(f, (await probe(f)).seconds, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Whatever's said in it. Fails closed: audio we can't transcribe can't be reviewed. */
async function transcribe(file, dir) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("transcription isn't configured");
  const audio = join(dir, "a.mp3");
  await run(FFMPEG, ["-y", "-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", audio], { timeout: 2 * 60 * 1000 });
  const form = new FormData();
  form.append("model", process.env.TRANSCRIBE_MODEL || "whisper-1");
  form.append("file", new Blob([readFileSync(audio)], { type: "audio/mpeg" }), "a.mp3");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || typeof d.text !== "string") throw new Error(`transcription failed: ${d.error?.message || res.status}`);
  return d.text.trim();
}

// ---------- storage ----------

/** Upload the re-encode to Blob with a one-file token from the site
 * (`api` is the worker's authed POST helper). */
export async function storeVideo(api, sessionId, n, mp4) {
  const { pathname, token } = await api("/api/worker/blob", { sessionId, n });
  const blob = await put(pathname, mp4, { access: "public", token, contentType: "video/mp4", multipart: mp4.length > 20 * 1024 * 1024 });
  return blob.url;
}
