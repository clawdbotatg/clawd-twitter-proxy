import { NextResponse } from "next/server";
import type { TweetMetrics } from "@/lib/score";
import { dueTweets, recordMetrics } from "@/lib/store";
import { workerAuthorized } from "@/lib/worker-auth";

export const dynamic = "force-dynamic";

/** The worker reads engagement from X (it holds the X keys). It posts back
 * what it read ({ results: { tweetId: metrics | null } }) and gets the ids
 * due next. */
export async function POST(req: Request) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const results = (body.results ?? {}) as Record<string, TweetMetrics | null>;
  for (const [id, m] of Object.entries(results)) {
    if (/^\d{1,25}$/.test(id)) await recordMetrics(id, m);
  }
  return NextResponse.json({ due: await dueTweets(100) });
}
