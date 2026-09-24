/** The price of a tweet session, in CV.
 *
 * Keeps @clawdbotatg active but not spammy — at most about one tweet an hour.
 * The auction restarts whenever clawd tweets (a paid tweet here, or any post
 * from clawd-twitter's pipeline):
 *   - reset: START_FRACTION (10%) of the single largest CV balance on larv.ai
 *     (never below the floor);
 *   - the first hour stays expensive: it only halves, 10% → 5%;
 *   - then it falls fast, 5% → FLOOR_CV over the next FALL_MS (3h) — floor 4h after the tweet,
 *     and rests at the floor until the next tweet.
 * Both legs are exponential, so each is a steady percentage drop per minute.
 * Buying a session does NOT reset the price — only a tweet does. */

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

export function priceAt(state: PriceState, now: number): number {
  const start = Math.max(state.startPrice, FLOOR_CV);
  const holdEnd = Math.max(start * HOLD_END_RATIO, FLOOR_CV);
  const dt = Math.max(now - state.resetAt, 0);
  const p = dt < HOLD_MS
    ? glide(start, holdEnd, dt / HOLD_MS)
    : glide(holdEnd, FLOOR_CV, Math.min((dt - HOLD_MS) / FALL_MS, 1));
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
