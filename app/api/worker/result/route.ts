import { NextResponse } from "next/server";
import { pushFeed, putImage, trackTweet, updateSession } from "@/lib/store";
import { workerAuthorized } from "@/lib/worker-auth";

export const dynamic = "force-dynamic";

interface Result {
  jobId: string;
  sessionId: string;
  type: "turn" | "image" | "post";
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
  // post
  tweetId?: string;
  url?: string;
  text?: string;
}

export async function POST(req: Request) {
  if (!workerAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = (await req.json()) as Result;

  if (r.type === "image" && r.ok && r.b64) await putImage(r.sessionId, r.n!, r.b64);

  let posted = false;
  const s = await updateSession(r.sessionId, x => {
    // A tweet that went out is a fact, even if the session already gave up on
    // the job — record it no matter what. Anything else stale is dropped.
    const landedPost = r.type === "post" && r.ok && x.status === "active";
    if (x.pending?.jobId !== r.jobId && !landedPost) return;
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
    });
    await trackTweet({ tweetId: s.tweet.id, sessionId: s.id, wallet: s.wallet, url: s.tweet.url, text: s.tweet.text, postedAt: s.tweet.postedAt });
    // No reset here: the purchase already reset the auction for this slot.
  }
  return NextResponse.json({ ok: true });
}
