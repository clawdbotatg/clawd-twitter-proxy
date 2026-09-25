import { NextResponse } from "next/server";
import { extendActiveSessions } from "@/lib/store";
import { workerAuthorized } from "@/lib/worker-auth";

export const dynamic = "force-dynamic";

/** Claude came back after an outage: live sessions get the lost time back. */
export async function POST(req: Request) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { ms } = await req.json().catch(() => ({}));
  if (typeof ms !== "number" || !(ms > 0) || ms > 24 * 60 * 60 * 1000) return NextResponse.json({ error: "bad ms" }, { status: 400 });
  return NextResponse.json({ extended: await extendActiveSessions(Math.ceil(ms)) });
}
