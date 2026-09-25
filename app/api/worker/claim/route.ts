import { NextResponse } from "next/server";
import { claimJob, getImage, getSession, isHot, setWorkerStatus, takeEvents } from "@/lib/store";
import { workerAuthorized } from "@/lib/worker-auth";
import { MAX_TURNS } from "@/lib/limits";

export const dynamic = "force-dynamic";

/** The worker's poll. Doubles as its heartbeat (and pause switch), hands back
 * pending Telegram notifications, and the next job with everything it needs. */
export async function POST(req: Request) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  await setWorkerStatus(!!body.paused, body.healthy !== false);
  const events = await takeEvents();

  for (let i = 0; i < 5; i++) {
    const job = await claimJob();
    if (!job) break;
    const s = await getSession(job.sessionId);
    // Stale: the session moved on (timeout released it, or it's closed).
    if (!s || s.status !== "active" || s.pending?.jobId !== job.jobId) continue;
    const payload: Record<string, unknown> = {
      events,
      job,
      maxTurns: MAX_TURNS,
      session: {
        id: s.id,
        wallet: s.wallet,
        pricePaid: s.pricePaid,
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
    if (job.type === "image" && job.n !== undefined && s.images[job.n]?.source === "upload") {
      payload.imageB64 = await getImage(s.id, job.n);
    }
    return NextResponse.json(payload);
  }
  return NextResponse.json({ events, job: null, hot: await isHot() });
}
