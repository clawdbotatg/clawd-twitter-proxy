"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "./ConnectButton";
import { usePrice } from "./usePrice";
import { compactCV, rememberSession } from "@/lib/client";
import {
  CV_SIGN_MESSAGE,
  clearCachedCVSignature,
  formatCV,
  getCachedCVSignature,
  setCachedCVSignature,
  useConviction,
} from "@/lib/conviction";
import { MAX_IMAGES, MAX_TURNS } from "@/lib/limits";

type Step = "idle" | "signing" | "burning";

export function BuyCard() {
  const router = useRouter();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { account, refresh } = useConviction(address);
  const { info, live, reload } = usePrice();
  const closed = info ? !info.open : false;
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const insufficient = !!address && account !== null && live !== null && account.balance < live;
  const busy = step !== "idle";

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
    <div className="border border-line bg-paper text-ink shadow-xl">
      <div className="border-b border-line bg-paper-dark px-6 py-4 flex items-baseline justify-between">
        <span className="smallcaps text-sm font-semibold text-ink-soft">Commission Form T-1</span>
        <span className="font-display text-2xl font-semibold tabular">{compactCV(live)} CV</span>
      </div>

      <div className="p-6 space-y-5">
        <ul className="text-sm space-y-2 text-ink-soft">
          <li>▸ <strong className="text-ink">{MAX_TURNS} turns</strong> with clawd (Claude Opus 5.5) to shape one tweet</li>
          <li>▸ up to <strong className="text-ink">{MAX_IMAGES} images</strong> (gpt-image), with or without clawd in them</li>
          <li>▸ press <strong className="text-ink">tweet</strong> and it posts from <a className="underline hover:text-lobster" href="https://x.com/clawdbotatg" target="_blank" rel="noopener noreferrer">@clawdbotatg</a>, or walk away. The burn is final either way.</li>
          <li>▸ your tweet resets the price to 10% of the top holder&apos;s CV</li>
        </ul>

        {mounted && address && account && (
          <div className="flex justify-between text-sm border-t border-line pt-4">
            <span className="text-ink-soft">Your spendable conviction</span>
            <span className="font-mono tabular">{formatCV(account.balance)} CV</span>
          </div>
        )}

        {mounted && !address && (
          <div className="flex justify-center py-2">
            <ConnectButton />
          </div>
        )}

        {mounted && insufficient && (
          <p className="text-sm text-seal">
            Not enough conviction yet. The price falls every second until someone tweets, and your CV grows every second
            you stay staked. Or stake more at{" "}
            <a href="https://stake.onedollaraudit.com" className="underline" target="_blank" rel="noopener noreferrer">stake.onedollaraudit.com</a>.
          </p>
        )}

        {closed && (
          <p className="text-sm text-seal border border-seal/40 bg-seal/5 px-4 py-3">
            {info?.closedReason ?? "the desk is closed"}. Purchases are paused, and no CV will be taken.
          </p>
        )}

        {mounted && address && (
          <button
            onClick={buy}
            disabled={busy || live === null || insufficient || closed}
            className="w-full py-4 bg-ink text-paper smallcaps text-base font-semibold tracking-wider hover:bg-lobster transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === "signing" && "Sign the conviction note in your wallet…"}
            {step === "burning" && "Burning conviction…"}
            {step === "idle" && (live !== null ? `Burn ${formatCV(live)} CV & open a session` : "Reading the price…")}
          </button>
        )}

        {error && <p className="text-sm text-seal border border-seal/40 bg-seal/5 px-4 py-3">{error}</p>}

        <p className="text-xs text-ink-soft/70 leading-relaxed">
          One signature lets larv.ai&apos;s ledger debit your conviction. Nothing touches your tokens and there&apos;s no
          transaction. Every tweet passes a safety review before it posts; clawd won&apos;t post scams, shills, harassment
          or anything against X&apos;s rules.
        </p>
      </div>
    </div>
  );
}
