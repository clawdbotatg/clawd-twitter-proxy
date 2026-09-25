/** The price of a tweet session, in CV.
 *
 * Keeps @clawdbotatg active but not spammy — at most about one tweet an hour.
 * The auction restarts on every purchase here (app/api/session) and whenever
 * clawd tweets from clawd-twitter's pipeline (the worker tails its posted-log).
 * A paid tweet does NOT reset it again — its purchase already did.
 *   - reset: START_FRACTION (10%) of the single largest CV balance on larv.ai
 *     (never below the floor);
 *   - the first hour stays expensive: it only halves, 10% → 5%;
 *   - then it falls fast, 5% → FLOOR_CV over the next FALL_MS (3h) — floor 4h after the tweet,
 *     and rests at the floor until the next tweet.
 * Both legs are exponential, so each is a steady percentage drop per minute.
 */

export const FLOOR_CV = 50_000_000;
export const START_FRACTION = 0.1;
export const HOLD_MS = 60 * 60 * 1000;
/** Where the first hour ends, as a fraction of the reset price. */
export const HOLD_END_RATIO = 0.5;
export const FALL_MS = 3 * 60 * 60 * 1000;
export const DECAY_MS = HOLD_MS + FALL_MS;

export interface PriceState {
  /** When the current auction started (last tweet, or first boot). */
  resetAt: number;
  /** CV price at resetAt. */
  startPrice: number;
}

export function startPriceFor(highestCV: number): number {
  return Math.max(FLOOR_CV, Math.ceil(highestCV * START_FRACTION));
}

function glide(from: number, to: number, t: number): number {
  return from * Math.pow(to / from, t);
}

/** The plain after-a-tweet curve (no scheduled ramp). */
export function decayAt(state: PriceState, now: number): number {
  const start = Math.max(state.startPrice, FLOOR_CV);
  const holdEnd = Math.max(start * HOLD_END_RATIO, FLOOR_CV);
  const dt = Math.max(now - state.resetAt, 0);
  return dt < HOLD_MS
    ? glide(start, holdEnd, dt / HOLD_MS)
    : glide(holdEnd, FLOOR_CV, Math.min((dt - HOLD_MS) / FALL_MS, 1));
}

// ---- clawd's scheduled tweets ----
// clawd-twitter posts the gm at 8:02am and the nightly at 8:02pm, Denver time
// (the nightly only on busy days). The hour before each, the price climbs
// back to the full reset level so nobody's paid tweet lands on top of them.
// It holds a little past the slot; if the tweet came, its reset takes over,
// and if it didn't (a skipped nightly), the price falls back to the curve.
export const SCHEDULE_TZ = "America/Denver";
export const SCHEDULED_MIN = [8 * 60 + 2, 20 * 60 + 2]; // minutes after local midnight
export const RAMP_MS = 60 * 60 * 1000;
export const RAMP_HOLD_MS = 15 * 60 * 1000;

const tzParts = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHEDULE_TZ, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Milliseconds since local (Denver) midnight. */
function localMsOfDay(now: number): number {
  const p = Object.fromEntries(tzParts.formatToParts(new Date(now)).map(x => [x.type, x.value]));
  return ((Number(p.hour) % 24) * 3600 + Number(p.minute) * 60 + Number(p.second)) * 1000 + (now % 1000);
}

/** If a scheduled tweet is near: how far into its ramp (0..1) and when it is. */
export function scheduledRamp(now: number): { progress: number; slotAt: number } | null {
  const t = localMsOfDay(now);
  const DAY = 24 * 3600 * 1000;
  for (const min of SCHEDULED_MIN) {
    const slot = min * 60 * 1000;
    // distance to this slot, today or wrapping around midnight
    for (const s of [slot, slot + DAY, slot - DAY]) {
      const until = s - t; // >0 before the slot
      if (until <= RAMP_MS && until > -RAMP_HOLD_MS) {
        return { progress: Math.min(1, 1 - until / RAMP_MS), slotAt: now + until };
      }
    }
  }
  return null;
}

/** The next scheduled clawd tweet after `now` (epoch ms). */
export function nextScheduledAt(now: number): number {
  const t = localMsOfDay(now);
  const DAY = 24 * 3600 * 1000;
  const untils = SCHEDULED_MIN.flatMap(min => [min * 60 * 1000 - t, min * 60 * 1000 + DAY - t]).filter(u => u > 0);
  return now + Math.min(...untils);
}

export function priceAt(state: PriceState, now: number): number {
  let p = decayAt(state, now);
  const ramp = scheduledRamp(now);
  if (ramp) {
    const top = Math.max(state.startPrice, FLOOR_CV);
    // Climb from wherever the curve is toward the reset level, same shape as the fall.
    p = Math.max(p, glide(Math.max(p, FLOOR_CV), top, ramp.progress));
  }
  return Math.max(FLOOR_CV, Math.ceil(p));
}

/** When the price reaches the floor. */
export function floorAt(state: PriceState): number {
  return state.resetAt + DECAY_MS;
}

/** When the expensive first hour ends. */
export function holdEndsAt(state: PriceState): number {
  return state.resetAt + HOLD_MS;
}
