/** Per-session budgets. A session is bought once; everything inside it is free. */
export const MAX_TURNS = 12;
export const MAX_IMAGES = 4;
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_IMAGE_PROMPT_CHARS = 1000;
/** Uploads are re-encoded to JPEG in the browser; this caps the result. */
export const MAX_UPLOAD_BYTES = 2_500_000;
/** A session you paid for stays usable this long. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** A job the worker never answered is abandoned after this (the turn is not spent). */
export const JOB_TIMEOUT_MS = 6 * 60 * 1000;
