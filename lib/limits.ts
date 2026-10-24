/** Per-session budgets. A session is bought once; everything inside it is free. */
export const MAX_TURNS = 12;
export const MAX_IMAGES = 4;
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_IMAGE_PROMPT_CHARS = 1000;
/** Videos (generated or uploaded) share their own budget; each one is a
 * generation or a frame-by-frame review on the worker. */
export const MAX_VIDEOS = 2;
/** Raw upload cap. The worker re-encodes to ≤720p H.264 before review, and
 * what it reviews is exactly what posts. */
export const MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024;
/** X's limit for a normal account. */
export const MAX_VIDEO_SECONDS = 140;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
/** Uploads are re-encoded to JPEG in the browser; this caps the result. */
export const MAX_UPLOAD_BYTES = 2_500_000;
/** Drafting time after purchase, then a short last call where the only move
 * left is to tweet. The session is over at DRAFT_MS + FINAL_MS. */
export const DRAFT_MS = 15 * 60 * 1000;
export const FINAL_MS = 2 * 60 * 1000;
export const SESSION_TTL_MS = DRAFT_MS + FINAL_MS;

/** When drafting stops (derived, so older sessions keep their own expiry). */
export function draftEndsAt(s: { expiresAt: number }): number {
  return s.expiresAt - FINAL_MS;
}
/** A job the worker never answered is abandoned after this (the turn is not spent). */
export const JOB_TIMEOUT_MS = 6 * 60 * 1000;
/** Video jobs (Grok + re-encode + review) and posts carrying a video (X
 * processes it) get longer. */
export const VIDEO_JOB_TIMEOUT_MS = 12 * 60 * 1000;
