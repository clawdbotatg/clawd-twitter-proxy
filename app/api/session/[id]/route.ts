import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGES, MAX_IMAGE_PROMPT_CHARS, MAX_MESSAGE_CHARS, MAX_TURNS, MAX_UPLOAD_BYTES, draftEndsAt } from "@/lib/limits";
import { JobType, Session, authorized, enqueue, getSession, newId, publicView, putImage, updateSession } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function tokenOf(req: NextRequest, body?: { t?: string }): string | null {
  return req.headers.get("x-session-token") || body?.t || null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const s = await getSession(id);
  if (!s || s.status === "unpaid" || s.status === "void") return NextResponse.json({ error: "no such session" }, { status: 404 });
  if (!authorized(s, tokenOf(req))) {
    // Posted sessions are public receipts; live ones are private to the buyer.
    if (s.status === "posted") return NextResponse.json({ session: { ...publicView(s), messages: [] }, readOnly: true });
    return NextResponse.json({ error: "not your session" }, { status: 403 });
  }
  return NextResponse.json({ session: publicView(s), limits: { MAX_TURNS, MAX_IMAGES } });
}

class Refuse extends Error {}

/** Failures on our side (timeouts, crashes) don't use up an image. */
const imagesUsed = (x: Session) => x.images.filter(i => i.status !== "failed").length;

/** Every user action on a paid session. One job in flight at a time. */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const s0 = await getSession(id);
  if (!s0) return NextResponse.json({ error: "no such session" }, { status: 404 });
  if (!authorized(s0, tokenOf(req, body))) return NextResponse.json({ error: "not your session" }, { status: 403 });

  // An upload is validated and stored before the session update; the worker
  // then vets it (vision review) before it can be attached.
  let upload: string | null = null;
  if (body.action === "upload") {
    const b64 = typeof body.jpeg === "string" ? body.jpeg.replace(/^data:image\/jpeg;base64,/, "") : "";
    const bytes = Buffer.from(b64, "base64");
    const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!isJpeg) return NextResponse.json({ error: "that isn't an image we can use" }, { status: 400 });
    if (bytes.length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "image too large" }, { status: 400 });
    upload = bytes.toString("base64");
  }

  let job: { type: JobType; n?: number } | null = null;
  try {
    const s = await updateSession(id, (x: Session) => {
      if (x.status !== "active") throw new Refuse(x.status === "posted" ? "this session already tweeted" : "session is closed");
      if (Date.now() > x.expiresAt) throw new Refuse("time's up — this session is over");
      // Last call: drafting is closed, the only move left is to tweet.
      const lastCall = Date.now() > draftEndsAt(x);
      if (lastCall && body.action !== "tweet" && body.action !== "attach") throw new Refuse("drafting time is over — tweet it or let it go");
      x.notice = null;

      switch (body.action) {
        case "message": {
          const text = String(body.text ?? "").trim();
          if (!text) throw new Refuse("say something");
          if (text.length > MAX_MESSAGE_CHARS) throw new Refuse(`keep it under ${MAX_MESSAGE_CHARS} characters`);
          if (x.pending) throw new Refuse("clawd is still working on the last one");
          if (x.turns >= MAX_TURNS) throw new Refuse("out of turns — tweet the draft or let it go");
          x.messages.push({ role: "user", text, ts: Date.now() });
          job = { type: "turn" };
          break;
        }
        case "image": {
          const prompt = String(body.prompt ?? "").trim();
          if (!prompt) throw new Refuse("describe the image");
          if (prompt.length > MAX_IMAGE_PROMPT_CHARS) throw new Refuse(`keep it under ${MAX_IMAGE_PROMPT_CHARS} characters`);
          if (x.pending) throw new Refuse("clawd is still working on the last one");
          if (imagesUsed(x) >= MAX_IMAGES) throw new Refuse(`that's all ${MAX_IMAGES} images for this session`);
          const n = x.images.length;
          x.images.push({ n, prompt, withClawd: !!body.withClawd, status: "pending", source: "generated" });
          job = { type: "image", n };
          break;
        }
        case "upload": {
          if (x.pending) throw new Refuse("clawd is still working on the last one");
          if (imagesUsed(x) >= MAX_IMAGES) throw new Refuse(`that's all ${MAX_IMAGES} images for this session`);
          const n = x.images.length;
          x.images.push({ n, prompt: "", withClawd: false, status: "pending", source: "upload" });
          job = { type: "image", n };
          break;
        }
        case "attach": {
          const n = body.n === null ? null : Number(body.n);
          if (n !== null && x.images[n]?.status !== "ready") throw new Refuse("that image isn't ready");
          x.attachImage = n;
          break;
        }
        case "tweet": {
          if (x.pending) throw new Refuse("clawd is still working on the last one");
          if (!x.draft) throw new Refuse("there's no draft yet");
          job = { type: "post" };
          break;
        }
        default:
          throw new Refuse("unknown action");
      }
      if (job) x.pending = { type: job.type, since: Date.now(), jobId: newId(8) };
    });
    if (!s) return NextResponse.json({ error: "no such session" }, { status: 404 });
    if (job && s.pending) {
      const j = job as { type: JobType; n?: number };
      if (upload && j.n !== undefined) await putImage(id, j.n, upload);
      await enqueue({ jobId: s.pending.jobId, type: j.type, sessionId: id, n: j.n });
    }
    return NextResponse.json({ session: publicView(s) });
  } catch (e) {
    if (e instanceof Refuse) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
