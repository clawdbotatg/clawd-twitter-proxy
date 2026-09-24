"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignMessage } from "wagmi";
import { usePrice } from "./usePrice";
import { Thinking } from "./Thinking";
import { ago, compactCV, rememberSession } from "@/lib/client";
import {
  CV_SIGN_MESSAGE,
  clearCachedCVSignature,
  formatCV,
  getCachedCVSignature,
  setCachedCVSignature,
  useConviction,
} from "@/lib/conviction";
import { MAX_IMAGES, MAX_TURNS } from "@/lib/limits";

/** Price + buy, one card. */
export function Desk() {
  const router = useRouter();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { account, refresh } = useConviction(address);
  const { info, live, serverNow, reload } = usePrice();
  const [step, setStep] = useState<"idle" | "signing" | "burning">("idle");
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const closed = info ? !info.open : false;
  const insufficient = !!address && account !== null && live !== null && account.balance < live;
  const span = info ? info.floorAt - info.resetAt : 1;
  const pct = info ? Math.min(100, Math.max(0, ((serverNow - info.resetAt) / span) * 100)) : 0;

  async function buy() {
    if (!address || live === null) return;
    setError(null);
    try {
      let signature = getCachedCVSignature(address);
      if (!signature) {
        setStep("signing");
        signature = await signMessageAsync({ message: CV_SIGN_MESSAGE });
        setCachedCVSignature(address, signature);
      }
      setStep("burning");
      // maxPrice = what we showed; the server charges its own (never higher) price.
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, signature, maxPrice: live }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.badSignature) clearCachedCVSignature(address);
        if (res.status === 409) reload();
        throw new Error(d.error || "couldn't open a session");
      }
      rememberSession({ id: d.id, token: d.token, createdAt: Date.now() });
      refresh();
      router.push(`/s/${d.id}`);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError((err.shortMessage || err.message || String(e)).slice(0, 300));
      setStep("idle");
    }
  }

  return (
    <div className="border border-line bg-paper text-ink shadow-xl p-6">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-5xl font-semibold tracking-tight tabular">{compactCV(live)}</span>
        <span className="font-display text-2xl text-ink-soft">CV</span>
      </div>

      <div className="mt-4 h-1.5 bg-paper-dark border border-line relative">
        <div className="absolute inset-y-0 left-0 bg-lobster" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-ink-soft font-mono tabular">
        <span>{info ? `reset ${ago(serverNow - info.resetAt)} ago` : "…"}</span>
        <span>{info ? (serverNow >= info.floorAt ? `${compactCV(info.floor)} floor` : `${compactCV(info.floor)} in ${ago(info.floorAt - serverNow)}`) : "…"}</span>
      </div>

      <p className="mt-5 text-sm text-ink-soft">30 min · {MAX_TURNS} messages · {MAX_IMAGES} images · 1 tweet</p>

      <div className="mt-5">
        {mounted && address && (
          <button
            onClick={buy}
            disabled={step !== "idle" || live === null || insufficient || closed}
            className="w-full py-4 bg-ink text-paper smallcaps text-base font-semibold tracking-wider hover:bg-lobster transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === "signing" ? <Thinking label="sign in your wallet" /> : step === "burning" ? <Thinking label="burning" /> : live !== null ? `Burn ${formatCV(live)} CV` : "…"}
          </button>
        )}
      </div>

      {mounted && address && account && (
        <p className="mt-3 text-xs text-ink-soft font-mono tabular">
          you have {formatCV(account.balance)} CV
          {insufficient && (
            <>
              {" · "}
              <a href="https://stake.onedollaraudit.com" className="underline text-seal" target="_blank" rel="noopener noreferrer">stake for more</a>
            </>
          )}
        </p>
      )}
      {closed && <p className="mt-3 text-sm text-seal">{info?.closedReason}</p>}
      {error && <p className="mt-3 text-sm text-seal">{error}</p>}
    </div>
  );
}
