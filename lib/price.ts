/** The price of a tweet session, in CV.
 *
 * A reverse (Dutch) auction that restarts on every tweet:
 *   - the moment a tweet posts, the price resets to START_FRACTION of the
 *     single largest CV balance in larv.ai's ledger (never below the floor);
 *   - it then decays exponentially and lands exactly on FLOOR_CV after
 *     DECAY_MS, where it rests until the next tweet.
 *
 * Buying a session does NOT reset the price — only a posted tweet does.
 * Parallel buyers are fine: the price itself is the throttle. */

export const FLOOR_CV = 50_000_000;
export const START_FRACTION = 0.1;
export const DECAY_MS = 24 * 60 * 60 * 1000;

export interface PriceState {
  /** When the current auction started (last tweet, or first boot). */
  resetAt: number;
  /** CV price at resetAt. */
  startPrice: number;
}

export function startPriceFor(highestCV: number): number {
  return Math.max(FLOOR_CV, Math.ceil(highestCV * START_FRACTION));
}

export function priceAt(state: PriceState, now: number): number {
  const start = Math.max(state.startPrice, FLOOR_CV);
  const t = Math.min(Math.max(now - state.resetAt, 0), DECAY_MS) / DECAY_MS;
  return Math.max(FLOOR_CV, Math.ceil(start * Math.pow(FLOOR_CV / start, t)));
}

/** When the price reaches the floor. */
export function floorAt(state: PriceState): number {
  return state.resetAt + DECAY_MS;
}
