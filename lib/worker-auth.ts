import { timingSafeEqual } from "crypto";

/** The Mac worker authenticates with a shared bearer secret. */
export function workerAuthorized(req: Request): boolean {
  const want = process.env.WORKER_SECRET;
  const got = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!want || !got) return false;
  const a = Buffer.from(want), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
