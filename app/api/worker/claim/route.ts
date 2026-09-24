import { NextResponse } from "next/server";
import { claimJob, getImage, getSession, isHot } from "@/lib/store";
import { workerAuthorized } from "@/lib/worker-auth";
import { MAX_TURNS } from "@/lib/limits";

export const dynamic = "force-dynamic";

/** The worker pulls the next job along with everything it needs to do it. */
export async function POST(req: Request) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  for (let i = 0; i < 5; i++) {
    const job = await claimJob();
    if (!job) return NextResponse.json({ job: null, hot: await isHot() });
    const s = await getSession(job.sessionId);
    // Stale: the session moved on (timeout released it, or it's closed).
    if (!s || s.status !== "active" || s.pending?.jobId !== job.jobId) continue;
    const payload: Record<string, unknown> = {
      job,
      maxTurns: MAX_TURNS,
      session: {
        id: s.id,
        wallet: s.wallet,
        messages: s.messages,
        draft: s.draft,
        images: s.images,
        attachImage: s.attachImage,
        turns: s.turns,
      },
    };
    if (job.type === "post" && s.attachImage !== null) {
      payload.imageB64 = await getImage(s.id, s.attachImage);
    }
    return NextResponse.json(payload);
  }
  return NextResponse.json({ job: null, hot: await isHot() });
}
