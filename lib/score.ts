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

/** When to read a tweet's numbers again: 1h, 1d, 7d after posting; 7d is final. */
export const CHECKS_MS = [60 * 60 * 1000, 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000];

export function nextCheckAt(postedAt: number, checksDone: number): number | null {
  return checksDone < CHECKS_MS.length ? postedAt + CHECKS_MS[checksDone] : null;
}
