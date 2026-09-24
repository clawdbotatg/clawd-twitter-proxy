import { NextResponse } from "next/server";
import { getFeed } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ feed: await getFeed(20) });
}
