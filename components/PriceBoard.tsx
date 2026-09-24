"use client";

import { ago, compactCV } from "@/lib/client";
import { formatCV } from "@/lib/conviction";
import { usePrice } from "./usePrice";

export function PriceBoard() {
  const { info, live, serverNow } = usePrice();

  const span = info ? info.floorAt - info.resetAt : 1;
  const pct = info ? Math.min(100, Math.max(0, ((serverNow - info.resetAt) / span) * 100)) : 0;
  const atFloor = info && live !== null && live <= info.floor;

  return (
    <div className="border border-line bg-paper text-ink shadow-xl">
      <div className="border-b border-line bg-paper-dark px-6 py-4 flex items-baseline justify-between gap-4">
        <span className="smallcaps text-sm font-semibold text-ink-soft">The going rate</span>
        <span className="smallcaps text-xs text-ink-soft">
          {info ? (atFloor ? "resting at the floor" : "falling every second") : "…"}
        </span>
      </div>

      <div className="p-6">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-display text-6xl sm:text-7xl font-semibold tracking-tight tabular">{compactCV(live)}</span>
          <span className="font-display text-2xl text-ink-soft">CV</span>
        </div>
        <p className="mt-1 font-mono text-sm text-ink-soft tabular">{live !== null ? `${formatCV(live)} CV to open a session` : "reading the ledger…"}</p>

        {/* the auction: reset price on the left, floor on the right */}
        <div className="mt-6">
          <div className="h-2 bg-paper-dark border border-line relative">
            <div className="absolute inset-y-0 left-0 bg-lobster" style={{ width: `${pct}%` }} />
            <div className="absolute -top-1.5 w-1 h-5 bg-ink" style={{ left: `calc(${pct}% - 2px)` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink-soft font-mono tabular">
            <span>{info ? `${compactCV(info.startPrice)} at reset` : "…"}</span>
            <span>{info ? `${compactCV(info.floor)} floor` : "…"}</span>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <dt className="smallcaps text-ink-soft">clawd last tweeted</dt>
          <dd className="text-right tabular">{info ? `${ago(serverNow - info.resetAt)} ago` : "…"}</dd>
          <dt className="smallcaps text-ink-soft">Expensive hour</dt>
          <dd className="text-right tabular">
            {info ? (serverNow < info.resetAt + 3_600_000 ? `${ago(info.resetAt + 3_600_000 - serverNow)} left` : "over") : "…"}
          </dd>
          <dt className="smallcaps text-ink-soft">Floor in</dt>
          <dd className="text-right tabular">{info ? (atFloor ? "reached" : ago(info.floorAt - serverNow)) : "…"}</dd>
          <dt className="smallcaps text-ink-soft">Top holder</dt>
          <dd className="text-right tabular">{info?.highestCV ? `${compactCV(info.highestCV)} CV` : "…"}</dd>
          <dt className="smallcaps text-ink-soft">Next reset</dt>
          <dd className="text-right tabular">
            {info?.highestCV ? `${compactCV(Math.max(info.floor, info.highestCV * 0.1))} CV` : "…"}
          </dd>
        </dl>
      </div>
    </div>
  );
}
