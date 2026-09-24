"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { LocalSession, ago, localSessions, rememberSession } from "@/lib/client";
import { CV_SIGN_MESSAGE, getCachedCVSignature, setCachedCVSignature } from "@/lib/conviction";

/** Your open sessions: from this browser, or re-found with your wallet. */
export function MySessions() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [list, setList] = useState<LocalSession[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => setList(localSessions()), []);

  async function recover() {
    if (!address) return;
    setMsg(null);
    try {
      let signature = getCachedCVSignature(address);
      if (!signature) {
        signature = await signMessageAsync({ message: CV_SIGN_MESSAGE });
        setCachedCVSignature(address, signature);
      }
      const r = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, signature }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "couldn't look up sessions");
      for (const s of d.sessions) rememberSession({ id: s.id, token: s.token, createdAt: s.createdAt });
      setList(localSessions());
      setMsg(d.sessions.length ? null : "No sessions for this wallet yet.");
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setMsg((err.shortMessage || err.message || String(e)).slice(0, 200));
    }
  }

  if (!list.length && !address) return null;
  return (
    <div className="text-sm">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="smallcaps text-paper/70">Your sessions:</span>
          {list.slice(0, 6).map(s => (
            <Link key={s.id} href={`/s/${s.id}`} className="font-mono px-2 py-1 border border-lobster-line hover:border-paper">
              {s.id.slice(0, 6)} · {ago(Date.now() - s.createdAt)} ago
            </Link>
          ))}
        </div>
      )}
      {address && (
        <button onClick={recover} className="mt-2 smallcaps underline decoration-paper/40 hover:text-gold-bright">
          Paid from another browser? Find my sessions →
        </button>
      )}
      {msg && <p className="mt-1 text-paper/70">{msg}</p>}
    </div>
  );
}
