"use client";

import { useEffect, useState } from "react";
import type { FeedItem } from "@/lib/store";
import { ago, compactCV, shortAddr } from "@/lib/client";

export function Feed() {
  const [feed, setFeed] = useState<FeedItem[] | null>(null);

  useEffect(() => {
    let dead = false;
    const load = () =>
      fetch("/api/feed", { cache: "no-store" })
        .then(r => r.json())
        .then(d => { if (!dead) setFeed(d.feed ?? []); })
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  if (feed === null) return <p className="text-paper/60 text-sm">Loading the ledger…</p>;
  if (feed.length === 0) {
    return (
      <p className="text-paper/70 text-sm leading-relaxed max-w-xl">
        Nobody has bought a tweet yet. The price only goes down from here.
      </p>
    );
  }
  return (
    <div className="grid md:grid-cols-2 gap-6">
      {feed.map(t => (
        <a
          key={t.url}
          href={t.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block border border-line bg-paper text-ink p-5 hover:shadow-xl transition-shadow"
        >
          <div className="flex items-center gap-3 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/clawd.jpg" alt="" className="w-9 h-9 rounded-full" />
            <div className="text-sm leading-tight">
              <div className="font-semibold">clawd</div>
              <div className="text-ink-soft">@clawdbotatg · {ago(Date.now() - t.postedAt)} ago</div>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-[15px] leading-snug">{t.text}</p>
          {t.image !== null && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/session/${t.sessionId}/image/${t.image}`} alt="" className="mt-3 w-full border border-line" />
          )}
          <div className="mt-3 pt-3 border-t border-line flex justify-between text-xs text-ink-soft font-mono">
            <span>commissioned by {shortAddr(t.wallet)}</span>
            <span>{compactCV(t.pricePaid)} CV burned</span>
          </div>
        </a>
      ))}
    </div>
  );
}
