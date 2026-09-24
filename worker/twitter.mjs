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
