import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { MAX_VIDEOS, MAX_VIDEO_UPLOAD_BYTES, VIDEO_TYPES, draftEndsAt } from "@/lib/limits";
import { authorized, getSession, isVideo } from "@/lib/store";
import { videoPrefix } from "@/lib/blob";

export const dynamic = "force-dynamic";

/** Hands the browser a one-file Blob token so a video goes straight to Blob
 * (it's too big for a function body). The upload is only a file in a folder:
 * it joins the session through the "video-upload" action, which queues the
 * worker's re-encode and review. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    const out = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const s = await getSession(id);
        if (!s || !authorized(s, clientPayload)) throw new Error("not your session");
        if (s.status !== "active" || Date.now() > draftEndsAt(s)) throw new Error("session is closed");
        if (s.images.filter(m => isVideo(m) && m.status !== "failed").length >= MAX_VIDEOS) throw new Error(`that's all ${MAX_VIDEOS} videos for this session`);
        if (!pathname.startsWith(videoPrefix(id)) || pathname.includes("..")) throw new Error("bad path");
        return {
          allowedContentTypes: VIDEO_TYPES,
          maximumSizeInBytes: MAX_VIDEO_UPLOAD_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 15 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
