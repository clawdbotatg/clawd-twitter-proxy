"use client";

/** Session tokens live in this browser (the server only keeps a hash).
 * Lost them? The wallet's CV signature re-opens the sessions (/api/sessions). */
const KEY = "btt_sessions";

export interface LocalSession {
  id: string;
  token: string;
  createdAt: number;
}

export function localSessions(): LocalSession[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "[]") as LocalSession[];
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function rememberSession(s: LocalSession): void {
  try {
    const rest = localSessions().filter(x => x.id !== s.id);
    localStorage.setItem(KEY, JSON.stringify([s, ...rest].slice(0, 30)));
  } catch {
    // storage unavailable — the signature recovery path still works
  }
}

export function sessionToken(id: string): string | null {
  return localSessions().find(s => s.id === id)?.token ?? null;
}

/** 1.32B / 480.5M / 50M — prices are big numbers, show them human-sized. */
export function compactCV(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "…";
  const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [v, s] of units) {
    if (n >= v) {
      const x = n / v;
      const str = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
      return `${str.includes(".") ? str.replace(/\.?0+$/, "") : str}${s}`;
    }
  }
  return Math.floor(n).toLocaleString("en-US");
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

