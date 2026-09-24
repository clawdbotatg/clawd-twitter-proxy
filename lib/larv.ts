import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

/** larv.ai owns the conviction ledger. We read the top balance (the pricing
 * oracle) and debit CV through its spend API, which needs the shared
 * CV_SPEND_SECRET plus the wallet's signature of the fixed message. */
export const LARV_APP = "https://larv.ai";
export const CV_SIGN_MESSAGE = "larv.ai CV Spend";

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org"),
});

export async function fetchHighestCV(): Promise<number | null> {
  try {
    const res = await fetch(`${LARV_APP}/api/cv/highest`, { cache: "no-store" });
    if (!res.ok) return null;
    const d = await res.json();
    const n = Number(d.highestCVBalance ?? 0);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Spendable CV (larv.ai's public ledger read), or null if unreadable. */
export async function fetchBalance(wallet: string): Promise<number | null> {
  try {
    const res = await fetch(`${LARV_APP}/api/clawdviction/${wallet}`, { cache: "no-store" });
    if (!res.ok) return null;
    const d = await res.json();
    const n = Number(d.balance ?? d.clawdviction);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** EOAs and EIP-1271 smart wallets. */
export async function verifyCVSignature(wallet: string, signature: string): Promise<boolean> {
  try {
    return await client.verifyMessage({
      address: wallet as `0x${string}`,
      message: CV_SIGN_MESSAGE,
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

export async function spendCV(
  wallet: string,
  signature: string,
  amount: number,
): Promise<{ ok: true; newBalance: number } | { ok: false; status: number; error: string }> {
  // Local end-to-end runs only: never debits anything, can't activate in a prod build.
  if (process.env.NODE_ENV !== "production" && process.env.DEV_FAKE_SPEND === "1") {
    return { ok: true, newBalance: 0 };
  }
  const secret = process.env.CV_SPEND_SECRET;
  if (!secret) return { ok: false, status: 503, error: "CV spending isn't configured on this server" };
  const res = await fetch(`${LARV_APP}/api/cv/spend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, signature, secret, amount }),
    cache: "no-store",
  });
  const text = await res.text();
  let d: { success?: boolean; newBalance?: number; error?: string; balance?: number };
  try {
    d = JSON.parse(text);
  } catch {
    return { ok: false, status: 502, error: "the conviction ledger returned an invalid response" };
  }
  if (!res.ok || !d.success) {
    const err = d.error === "insufficient balance" && d.balance !== undefined
      ? `insufficient CV — your spendable balance is ${Math.floor(d.balance).toLocaleString("en-US")}`
      : d.error || "conviction spend failed";
    return { ok: false, status: res.status >= 400 ? res.status : 400, error: err };
  }
  return { ok: true, newBalance: Number(d.newBalance ?? 0) };
}
