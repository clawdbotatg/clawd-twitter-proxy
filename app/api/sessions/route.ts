import { NextRequest, NextResponse } from "next/server";
import { rotateToken, walletSessions } from "@/lib/store";
import { verifyCVSignature } from "@/lib/larv";

export const dynamic = "force-dynamic";

/** Lost the tab? The same wallet signature re-opens your sessions. */
export async function POST(req: NextRequest) {
  const { wallet, signature } = await req.json().catch(() => ({}));
  if (typeof wallet !== "string" || typeof signature !== "string" || !(await verifyCVSignature(wallet, signature))) {
    return NextResponse.json({ error: "signature verification failed", badSignature: true }, { status: 401 });
  }
  const sessions = await walletSessions(wallet);
  const out = [];
  for (const s of sessions.slice(0, 10)) {
    const token = await rotateToken(s.id);
    out.push({ id: s.id, token, createdAt: s.createdAt, status: s.status, turns: s.turns, pricePaid: s.pricePaid });
  }
  return NextResponse.json({ sessions: out });
}
