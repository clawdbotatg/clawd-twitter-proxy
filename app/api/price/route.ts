import { NextResponse } from "next/server";
import { FLOOR_CV, floorAt, priceAt } from "@/lib/price";
import { deskStatus, getFeed, getPriceState } from "@/lib/store";
import { fetchHighestCV } from "@/lib/larv";

export const dynamic = "force-dynamic";

export async function GET() {
  const [state, highest, feed, desk] = await Promise.all([getPriceState(), fetchHighestCV(), getFeed(1), deskStatus()]);
  const now = Date.now();
  return NextResponse.json({
    price: priceAt(state, now),
    startPrice: state.startPrice,
    floor: FLOOR_CV,
    resetAt: state.resetAt,
    floorAt: floorAt(state),
    highestCV: highest,
    lastTweet: feed[0] ?? null,
    open: desk.open,
    closedReason: desk.reason,
    now,
  });
}
