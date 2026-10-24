import { NextResponse } from "next/server";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { workerAuthorized } from "@/lib/worker-auth";
import { newId } from "@/lib/store";
import { videoPrefix } from "@/lib/blob";

export const dynamic = "force-dynamic";

/** A one-file upload token for the worker's re-encoded video, so the store's
 * read-write token never leaves Vercel. */
export async function POST(req: Request) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { sessionId, n } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f]{24}$/.test(String(sessionId)) || !Number.isInteger(n)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const pathname = `${videoPrefix(sessionId)}v${n}-${newId(8)}.mp4`;
  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: ["video/mp4"],
    maximumSizeInBytes: 512 * 1024 * 1024,
    validUntil: Date.now() + 10 * 60 * 1000,
  });
  return NextResponse.json({ pathname, token });
}
