"use client";

import { useEffect, useRef, useState } from "react";
import { PriceState, priceAt } from "@/lib/price";
import type { FeedItem } from "@/lib/store";

export interface PriceInfo {
  price: number;
  startPrice: number;
  floor: number;
  resetAt: number;
  floorAt: number;
  highestCV: number | null;
  lastTweet: FeedItem | null;
  open: boolean;
  closedReason: string | null;
  /** server clock minus ours, so the local tick agrees with the server */
  skew: number;
}

/** The auction, polled every 15s and ticked locally every second — the
 * curve is deterministic, so the browser can compute it between polls. */
export function usePrice() {
  const [info, setInfo] = useState<PriceInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const infoRef = useRef<PriceInfo | null>(null);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const r = await fetch("/api/price", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (dead) return;
        const next = { ...d, skew: d.now - Date.now() } as PriceInfo;
        infoRef.current = next;
        setInfo(next);
      } catch {
        // keep the last known curve
      }
    };
    load();
    const poll = setInterval(load, 15_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { dead = true; clearInterval(poll); clearInterval(tick); };
  }, []);

  const serverNow = now + (info?.skew ?? 0);
  const state: PriceState | null = info ? { resetAt: info.resetAt, startPrice: info.startPrice } : null;
  const live = state ? priceAt(state, serverNow) : null;
  return { info, live, serverNow, reload: () => fetch("/api/price").then(r => r.json()).then(d => setInfo({ ...d, skew: d.now - Date.now() })) };
}
