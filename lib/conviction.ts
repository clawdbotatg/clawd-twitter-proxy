"use client";

import { useCallback, useEffect, useRef, useState } from "react";
const LARV_APP = "https://larv.ai";

/** On-chain conviction is raw token-wei × seconds. larv.ai's ledger divides by
 * this to get human "CV": 20M CLAWD staked for 24h = 1,000,000 CV. */
export const CV_DIVISOR = 1_728_000n * 10n ** 18n;
/** Float twin for display math — dividing as Numbers keeps the sub-CV
 * precision the live-ticking counter needs (BigInt division floors it away). */
export const CV_DIVISOR_NUM = 1_728_000 * 1e18;

/** The fixed message larv.ai's spend API verifies. Must match exactly. */
export const CV_SIGN_MESSAGE = "larv.ai CV Spend";

export interface ConvictionAccount {
  /** Optimistic live CV as of fetch time — the display value. */
  clawdviction: number;
  /** Materialized spendable CV in larv.ai's ledger — gate spends on this. */
  balance: number;
  /** CV per second currently accruing. */
  accrualRate: number;
  totalEarned: number;
  totalSpent: number;
  fetchedAt: number;
}

export async function fetchConviction(wallet: string): Promise<ConvictionAccount | null> {
  try {
    const res = await fetch(`${LARV_APP}/api/clawdviction/${wallet}`);
    if (!res.ok) return null;
    const d = await res.json();
    return {
      clawdviction: Number(d.clawdviction ?? 0),
      balance: Number(d.balance ?? d.clawdviction ?? 0),
      accrualRate: Number(d.accrualRate ?? 0),
      totalEarned: Number(d.totalEarned ?? 0),
      totalSpent: Number(d.totalSpent ?? 0),
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/** Highest single CV balance among all stakers — the pricing oracle: a
 * service costs ceil(highest / cvDivisor). */
export async function fetchHighestCV(): Promise<number | null> {
  try {
    const res = await fetch(`${LARV_APP}/api/cv/highest`);
    if (!res.ok) return null;
    const d = await res.json();
    const n = Number(d.highestCVBalance ?? 0);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Conviction account from larv.ai's ledger, re-fetched every 30s, with a
 * 1s client-side tick so the displayed figure accrues live. */
export function useConviction(wallet?: `0x${string}`) {
  const [account, setAccount] = useState<ConvictionAccount | null>(null);
  const [live, setLive] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const accountRef = useRef<ConvictionAccount | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    const a = await fetchConviction(wallet);
    if (a) {
      accountRef.current = a;
      setAccount(a);
      setError(false);
    } else {
      setError(true);
    }
  }, [wallet]);

  useEffect(() => {
    accountRef.current = null;
    setAccount(null);
    setLive(null);
    if (!wallet) return;
    refresh();
    const poll = setInterval(refresh, 30_000);
    const tick = setInterval(() => {
      const a = accountRef.current;
      if (!a) return;
      const elapsed = (Date.now() - a.fetchedAt) / 1000;
      setLive(a.clawdviction + a.accrualRate * elapsed);
    }, 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [wallet, refresh]);

  return { account, live: live ?? account?.clawdviction ?? null, error, refresh };
}

/** CV-spend signatures cached in localStorage, 7-day TTL (matches leftclaw). */
const SIG_PREFIX = "cv_spend_sig_";
const SIG_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getCachedCVSignature(wallet: string): string | null {
  try {
    const raw = localStorage.getItem(SIG_PREFIX + wallet.toLowerCase());
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (Date.now() > c.expiresAt) {
      localStorage.removeItem(SIG_PREFIX + wallet.toLowerCase());
      return null;
    }
    return c.signature;
  } catch {
    return null;
  }
}

export function setCachedCVSignature(wallet: string, signature: string): void {
  try {
    localStorage.setItem(
      SIG_PREFIX + wallet.toLowerCase(),
      JSON.stringify({ signature, expiresAt: Date.now() + SIG_TTL_MS }),
    );
  } catch {
    // localStorage full or unavailable
  }
}

export function clearCachedCVSignature(wallet: string): void {
  try {
    localStorage.removeItem(SIG_PREFIX + wallet.toLowerCase());
  } catch {
    // ignore
  }
}

/** Whole-number CV with thousands separators. */
export function formatCV(n: number | bigint | null | undefined): string {
  if (n === null || n === undefined) return "…";
  return Math.floor(Number(n)).toLocaleString("en-US");
}

