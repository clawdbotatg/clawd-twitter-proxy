"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectButton({ className = "" }: { className?: string }) {
  const { address } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (address) {
    return (
      <button
        onClick={() => disconnect()}
        className={`font-mono text-sm px-4 py-2 border border-line bg-paper-dark text-ink hover:bg-paper transition-colors ${className}`}
        title="Disconnect"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  // Dedupe: multiple injected wallets can register the same connector type
  const seen = new Set<string>();
  const list = connectors.filter(c => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={isPending}
        className="smallcaps text-sm font-semibold px-5 py-2.5 bg-ink text-paper border border-paper/50 hover:bg-lobster transition-colors disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 min-w-48 border border-line bg-paper text-ink shadow-lg">
          {list.map(c => (
            <button
              key={c.uid}
              onClick={() => {
                connect({ connector: c });
                setOpen(false);
              }}
              className="block w-full text-left px-4 py-3 text-sm hover:bg-paper-dark transition-colors"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
