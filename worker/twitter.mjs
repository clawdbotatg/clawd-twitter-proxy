// Post as @clawdbotatg (OAuth 1.0a user context — same keys clawd-twitter uses).
import { TwitterApi } from "twitter-api-v2";

let client;
function clawd() {
  if (client) return client;
  for (const k of ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]) {
    if (!process.env[k]) throw new Error(`missing ${k}`);
  }
  client = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });
  return client;
}

const HANDLE = process.env.CLAWD_X_HANDLE || "clawdbotatg";

/** Engagement numbers for our own tweets (≤100 ids). Uses the account's own
 * OAuth, so X also returns the owner-only counts (profile + link clicks,
 * for tweets under 30 days old). Missing ids (deleted) come back null. */
export async function tweetMetrics(ids) {
  const res = await clawd().v2.tweets(ids, { "tweet.fields": ["public_metrics", "non_public_metrics"] });
  const out = Object.fromEntries(ids.map(id => [id, null]));
  for (const t of res.data || []) {
    const p = t.public_metrics || {}, n = t.non_public_metrics || {};
    out[t.id] = {
      likes: p.like_count || 0,
      reposts: p.retweet_count || 0,
      replies: p.reply_count || 0,
      quotes: p.quote_count || 0,
      bookmarks: p.bookmark_count || 0,
      impressions: p.impression_count || n.impression_count || 0,
      profileClicks: n.user_profile_clicks || 0,
      linkClicks: n.url_link_clicks || 0,
    };
  }
  return { metrics: out, read: (res.data || []).length };
}

export async function postTweet(text, jpegB64) {
  if (process.env.DRY_RUN_POST === "1") {
    const id = `dry${Date.now()}`;
    return { id, url: `https://x.com/${HANDLE}/status/${id}` };
  }
  const c = clawd();
  const opts = {};
  if (jpegB64) {
    const mediaId = await c.v1.uploadMedia(Buffer.from(jpegB64, "base64"), { mimeType: "image/jpeg" });
    opts.media = { media_ids: [mediaId] };
  }
  const { data } = await c.v2.tweet(text, opts);
  return { id: data.id, url: `https://x.com/${HANDLE.replace(/^@/, "")}/status/${data.id}` };
}
