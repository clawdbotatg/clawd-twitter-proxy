// Which Claude subscription pays for clawd, and what to do when one dies.
//
// AGENT_CLAUDE_CONFIG_DIRS lists login dirs in order of preference. A call
// uses the first one that isn't cooling down; a login that's signed out or
// out of quota cools down and the call moves on to the next — the buyer never
// sees it. When none is usable, the worker reports itself unhealthy and the
// site stops selling sessions.
import { homedir } from "os";
import { join } from "path";

const DIRS = (process.env.AGENT_CLAUDE_CONFIG_DIRS || process.env.AGENT_CLAUDE_CONFIG_DIR || "")
  .split(",").map(s => s.trim()).filter(Boolean)
  .map(d => (d.includes("/") ? d : join(homedir(), ".clawd-accounts", d)));

const state = new Map(DIRS.map(d => [d, { coolUntil: 0, reason: "" }]));
const name = d => d.split("/").pop();

/** What an error means for the login that produced it. */
export function classify(message) {
  const m = String(message).toLowerCase();
  if (/not logged in|\/login|oauth|authenticat|unauthori|401|session expired/.test(m)) return { kind: "auth", coolMs: 30 * 60 * 1000 };
  if (/usage limit|limit reached|rate limit|429|quota|resets? at|credit balance/.test(m)) return { kind: "limit", coolMs: 60 * 60 * 1000 };
  if (/overloaded|529|503|timed out/.test(m)) return { kind: "busy", coolMs: 2 * 60 * 1000 };
  return null; // not the login's fault — don't switch
}

export function usable() {
  const now = Date.now();
  return DIRS.filter(d => state.get(d).coolUntil <= now);
}

export function healthy() {
  return DIRS.length === 0 || usable().length > 0;
}

export function cool(dir, kind, coolMs, detail) {
  const s = state.get(dir);
  if (!s) return;
  s.coolUntil = Date.now() + coolMs;
  s.reason = `${kind}: ${String(detail).slice(0, 120)}`;
}

export function summary() {
  const now = Date.now();
  return DIRS.map(d => {
    const s = state.get(d);
    return s.coolUntil > now ? `${name(d)} ✗ (${s.reason})` : `${name(d)} ✓`;
  }).join(", ");
}

/** Run fn(configDir) on the first usable login, falling through to the next
 * when a login fails for login reasons. onSwitch(dir, kind) reports a switch. */
export async function withAccount(fn, onSwitch) {
  if (DIRS.length === 0) return fn(undefined);
  let lastErr;
  for (const dir of usable()) {
    try {
      return await fn(dir);
    } catch (e) {
      const c = classify(e.message);
      if (!c) throw e;
      cool(dir, c.kind, c.coolMs, e.message);
      onSwitch?.(name(dir), c.kind);
      lastErr = e;
    }
  }
  throw lastErr || new Error("no Claude login is usable right now");
}

export const accountNames = () => DIRS.map(name);
