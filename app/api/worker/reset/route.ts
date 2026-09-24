import { NextResponse } from "next/server";
import { resetPrice } from "@/lib/store";
import { workerAuthorized } from "@/lib/worker-auth";

export const dynamic = "force-dynamic";

/** clawd tweeted from somewhere else (gm, nightly, the tweet desk): the worker
 * sees it in clawd-twitter's posted-log and resets the auction to that time. */
export async function POST(req: Request) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { at } = await req.json().catch(() => ({}));
  const when = typeof at === "number" && Number.isFinite(at) ? at : Date.now();
  const state = await resetPrice(when);
  return NextResponse.json({ ok: true, state });
}
