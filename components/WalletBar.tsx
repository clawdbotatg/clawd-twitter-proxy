"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "./ConnectButton";
import { useCreator } from "./useCreator";
import { compactCV } from "@/lib/client";
import { useConviction } from "@/lib/conviction";

/** Top right: your CV and creator score, then the wallet button. */
export function WalletBar() {
  const { address } = useAccount();
  const { live } = useConviction(address);
  const creator = useCreator(address);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex items-center gap-4">
      {mounted && address && (
        <div className="text-right text-xs leading-tight font-mono tabular">
          <div><span className="text-paper/60">CV</span> {compactCV(live)}</div>
          <div><span className="text-paper/60">score</span> {creator ? creator.score.toLocaleString("en-US") : "…"}</div>
        </div>
      )}
      <ConnectButton />
    </div>
  );
}
