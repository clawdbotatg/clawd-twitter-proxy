"use client";

import { useEffect, useState } from "react";

export interface CreatorStats {
  score: number;
  tweets: number;
  bySession: Record<string, number>;
}

/** A wallet's creator score, refreshed every minute. */
export function useCreator(wallet?: string) {
  const [stats, setStats] = useState<CreatorStats | null>(null);
  useEffect(() => {
    setStats(null);
    if (!wallet) return;
    let dead = false;
    const load = () =>
      fetch(`/api/creator/${wallet}`, { cache: "no-store" })
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (!dead && d) setStats(d); })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { dead = true; clearInterval(t); };
  }, [wallet]);
  return stats;
}
