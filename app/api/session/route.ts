import { NextRequest, NextResponse } from "next/server";
import { priceAt } from "@/lib/price";
import { createSession, deleteSession, deskStatus, getPriceState, pushEvent, countAttempt, resetPrice, saveSession } from "@/lib/store";
import { fetchBalance, spendCV, verifyCVSignature } from "@/lib/larv";

export const dynamic = "force-dynamic";

/** Buy a session: burn the current price in CV, get a session + its token.
 * The client sends the price it saw as maxPrice; if a tweet landed meanwhile
 * and the price reset upward, we refuse rather than surprise-charge. */
export async function POST(req: NextRequest) {
  const { wallet, signature, maxPrice } = await req.json().catch(() => ({}));
  if (typeof wallet !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(wallet) || typeof signature !== "string") {
    return NextResponse.json({ error: "missing wallet or signature" }, { status: 400 });
  }
  if (!(await verifyCVSignature(wallet, signature))) {
    return NextResponse.json({ error: "signature verification failed", badSignature: true }, { status: 401 });
  }

  // Never take CV when nobody's there to serve the session.
  const desk = await deskStatus();
  if (!desk.open) return NextResponse.json({ error: `${desk.reason} — no CV was spent, try again later` }, { status: 503 });

  const price = priceAt(await getPriceState(), Date.now());
  if (typeof maxPrice !== "number" || price > maxPrice) {
    return NextResponse.json(
      { error: "the price moved up (someone just tweeted) — check the new price and try again", price },
      { status: 409 },
    );
  }

  // Cheap checks before anything touches the database or larv.ai's spend API:
  // a few attempts a minute per wallet, and enough CV to cover the price.
  if ((await countAttempt(wallet, 60_000)) > 3) {
    return NextResponse.json({ error: "too many tries — wait a minute" }, { status: 429 });
  }
  const balance = await fetchBalance(wallet);
  if (balance !== null && balance < price) {
    return NextResponse.json(
      { error: `not enough CV — you have ${Math.floor(balance).toLocaleString("en-US")}, the price is ${price.toLocaleString("en-US")}` },
      { status: 402 },
    );
  }

  // Record first, then spend: if the spend succeeds we always have a session to show for it.
  const { session, token } = await createSession(wallet, price);
  const spent = await spendCV(wallet, signature, price);
  if (!spent.ok) {
    await deleteSession(session.id);
    return NextResponse.json({ error: spent.error }, { status: spent.status });
  }
  session.status = "active";
  await saveSession(session);
  // Buying is what resets the auction: the next buyer faces the expensive hour.
  await resetPrice();
  await pushEvent(`🔥 ${wallet.slice(0, 6)}…${wallet.slice(-4)} burned ${price.toLocaleString("en-US")} CV — session ${session.id.slice(0, 6)} open\nhttps://x.larv.ai`);
  return NextResponse.json({ id: session.id, token, pricePaid: price, newBalance: spent.newBalance });
}
