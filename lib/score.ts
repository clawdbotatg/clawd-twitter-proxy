/** Creator score for a paid tweet, from X's engagement numbers. Loosely after
 * X's open-sourced ranking weights, tuned by Austin: a quote or a profile
 * click says far more than a like. Replies and quotes are capped — they're
 * the cheapest to fake with alt accounts. */

export interface TweetMetrics {
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  bookmarks: number;
  impressions: number;
  profileClicks: number;
  linkClicks: number;
}

export const WEIGHTS = {
  quotes: 8,
  profileClicks: 5,
  replies: 4,
  reposts: 1,
  bookmarks: 1,
  linkClicks: 1,
  likes: 0.5,
  per1kImpressions: 1,
} as const;

export const CAPS = { replies: 200, quotes: 100 } as const;

export function scoreOf(m: TweetMetrics): number {
  const s =
    WEIGHTS.quotes * Math.min(m.quotes, CAPS.quotes) +
    WEIGHTS.profileClicks * m.profileClicks +
    WEIGHTS.replies * Math.min(m.replies, CAPS.replies) +
    WEIGHTS.reposts * m.reposts +
    WEIGHTS.bookmarks * m.bookmarks +
    WEIGHTS.linkClicks * m.linkClicks +
    WEIGHTS.likes * m.likes +
    WEIGHTS.per1kImpressions * (m.impressions / 1000);
  return Math.round(s * 10) / 10;
}

const H = 60 * 60 * 1000;
/** The score is final once a tweet is this old. */
export const FINAL_AGE_MS = 7 * 24 * H;

/** When to read a tweet's numbers next (X bills each read, ~$0.005):
 * every 30 min for the first 6 hours, every 3 hours to day one, then daily,
 * with a last read at exactly 7 days. Null once final. */
export function nextCheckAt(postedAt: number, now: number): number | null {
  const age = now - postedAt;
  if (age >= FINAL_AGE_MS) return null;
  const every = age < 6 * H ? H / 2 : age < 24 * H ? 3 * H : 24 * H;
  return Math.min(now + every, postedAt + FINAL_AGE_MS);
}
