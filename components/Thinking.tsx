"use client";

import { useEffect, useState } from "react";

/** Animated dots + what's happening + seconds elapsed since `since`. */
export function Thinking({ label, since }: { label: string; since?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = since ? Math.max(0, Math.floor((now - since) / 1000)) : null;
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <span className="inline-flex gap-1" aria-hidden>
        <span className="think-dot" />
        <span className="think-dot" />
        <span className="think-dot" />
      </span>
      <span>{label}{secs !== null && secs > 0 ? ` · ${secs}s` : ""}</span>
    </span>
  );
}
