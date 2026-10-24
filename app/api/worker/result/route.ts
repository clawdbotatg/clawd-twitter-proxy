import { NextResponse } from "next/server";
import { pushFeed, putImage, trackTweet, updateSession } from "@/lib/store";
import { workerAuthorized } from "@/lib/worker-auth";
import { dropBlob, isSessionBlob } from "@/lib/blob";

export const dynamic = "force-dynamic";

interface Result {
  jobId: string;
  sessionId: string;
  type: "turn" | "image" | "video" | "post";
  ok: boolean;
  /** user-facing reason when !ok */
  note?: string;
  // turn
  reply?: string;
  draft?: string | null;
  imageIdea?: string | null;
  // image
  n?: number;
  b64?: string;
  refused?: boolean;
  // video: the reviewed re-encode (in `url`)
  sha256?: string;
  transcript?: string;
  seconds?: number;
  // post (and video)
  tweetId?: string;
  url?: string;
  text?: string;
}

export async function POST(req: Request) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = (await req.json()) as Result;

  if (r.type === "image" && r.ok && r.b64) await putImage(r.sessionId, r.n!, r.b64);

  // Blobs no session points at any more (a raw upload once re-encoded, or a refusal).
  let orphans: string[] = [];
  let posted = false;
  const s = await updateSession(r.sessionId, x => {
    // A tweet that went out is a fact, even if the session already gave up on
    // the job — record it no matter what. Anything else stale is dropped.
    orphans = []; // updateSession may re-run this
    const landedPost = r.type === "post" && r.ok && x.status === "active";
    if (x.pending?.jobId !== r.jobId && !landedPost) {
      // Stale (timed out): the re-encode it made belongs to nobody.
      if (r.type === "video" && isSessionBlob(r.url, r.sessionId) && x.images[r.n!]?.url !== r.url) orphans.push(r.url!);
      return;
    }
    if (x.pending?.jobId === r.jobId) x.pending = null;
    if (r.type === "turn") {
      if (r.ok) {
        x.turns += 1;
        x.messages.push({ role: "clawd", text: r.reply || "", draft: r.draft ?? null, ts: Date.now() });
        if (r.draft) x.draft = r.draft;
        if (r.imageIdea) x.imageIdea = r.imageIdea;
      } else {
        x.notice = r.note || "clawd hit a snag — that turn wasn't counted, try again.";
      }
    } else if (r.type === "image") {
      const img = x.images[r.n!];
      if (img) {
        img.status = r.ok ? "ready" : r.refused ? "refused" : "failed";
        if (r.note) img.note = r.note;
        if (r.ok && x.attachImage === null) x.attachImage = img.n;
      }
      if (!r.ok) x.notice = r.note || "image generation failed";
    } else if (r.type === "video") {
      const v = x.images[r.n!];
      if (v) {
        if (r.ok && isSessionBlob(r.url, r.sessionId) && r.sha256) {
          if (v.url && v.url !== r.url) orphans.push(v.url);
          Object.assign(v, { status: "ready", url: r.url, sha256: r.sha256, transcript: r.transcript || "", seconds: r.seconds });
          if (x.attachImage === null) x.attachImage = v.n;
        } else {
          v.status = r.ok ? "failed" : r.refused ? "refused" : "failed";
          for (const u of [v.url, r.url]) if (u && isSessionBlob(u, r.sessionId)) orphans.push(u);
          v.url = undefined;
          x.notice = r.note || "the video didn't work out";
        }
        if (r.note) v.note = r.note;
      }
    } else if (r.type === "post") {
      if (r.ok && r.tweetId && r.url) {
        x.status = "posted";
        x.tweet = { id: r.tweetId, url: r.url, text: r.text || x.draft || "", postedAt: Date.now() };
        posted = true;
      } else {
        x.notice = r.note || "the tweet didn't go out";
      }
    }
  });

  if (posted && s?.tweet) {
    await pushFeed({
      url: s.tweet.url,
      text: s.tweet.text,
      wallet: s.wallet,
      pricePaid: s.pricePaid,
      postedAt: s.tweet.postedAt,
      sessionId: s.id,
      image: s.attachImage,
      video: s.attachImage !== null && s.images[s.attachImage]?.kind === "video" ? s.images[s.attachImage].url : null,
    });
    await trackTweet({ tweetId: s.tweet.id, sessionId: s.id, wallet: s.wallet, url: s.tweet.url, text: s.tweet.text, postedAt: s.tweet.postedAt });
    // No reset here: the purchase already reset the auction for this slot.
  }
  for (const u of orphans) await dropBlob(u);
  return NextResponse.json({ ok: true });
}
