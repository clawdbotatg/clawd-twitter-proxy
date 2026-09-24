"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@/lib/store";
import { compactCV, sessionToken, shortAddr } from "@/lib/client";
import { FINAL_MS, MAX_IMAGES, MAX_TURNS } from "@/lib/limits";
import { Thinking } from "./Thinking";

type View = Omit<Session, "tokenHash">;

/** Re-encode any image as a ≤1600px JPEG in the browser. That also strips
 * EXIF (GPS, camera) and anything else riding along in the file. */
async function toJpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88);
}

function clock(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function weightedLength(text: string): number {
  const urls = text.match(/https?:\/\/\S+/g) || [];
  return [...text.replace(/https?:\/\/\S+/g, "")].length + urls.length * 23;
}

export function SessionDesk({ id }: { id: string }) {
  const [s, setS] = useState<View | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [imgPrompt, setImgPrompt] = useState("");
  const [withClawd, setWithClawd] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const token = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const seen = useRef(0);

  const load = useCallback(async () => {
    const r = await fetch(`/api/session/${id}`, {
      headers: token.current ? { "x-session-token": token.current } : {},
      cache: "no-store",
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setGone(d.error || "not found"); return; }
    setReadOnly(!!d.readOnly);
    setS(d.session);
  }, [id]);

  useEffect(() => {
    token.current = sessionToken(id);
    load();
  }, [id, load]);

  // Poll fast while clawd works, slow otherwise.
  const pending = !!s?.pending;
  useEffect(() => {
    if (!s || s.status !== "active") return;
    const t = setInterval(load, pending ? 1500 : 10_000);
    return () => clearInterval(t);
  }, [s, pending, load]);

  useEffect(() => {
    const n = s?.messages.length ?? 0;
    if (n !== seen.current) { seen.current = n; bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }
  }, [s?.messages.length]);

  // Offer clawd's image idea once, without clobbering anything typed.
  useEffect(() => {
    if (s?.imageIdea && !imgPrompt) setImgPrompt(s.imageIdea);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.imageIdea]);

  async function act(body: Record<string, unknown>) {
    setErr(null);
    const r = await fetch(`/api/session/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-token": token.current || "" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(d.error || "that didn't work"); return false; }
    setS(d.session);
    return true;
  }

  async function upload(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) { setErr("that's not an image"); return; }
    try {
      await act({ action: "upload", jpeg: await toJpeg(file) });
    } catch {
      setErr("couldn't read that image");
    }
  }

  if (gone) {
    return (
      <Shell>
        <p className="text-paper/80">
          {gone === "not your session"
            ? "Not your session. Paid from another browser? Use “find my sessions” on the home page."
            : "No such session."}
        </p>
        <Link href="/" className="mt-4 inline-block smallcaps underline">← back</Link>
      </Shell>
    );
  }
  if (!s) return <Shell><p className="text-paper/70">…</p></Shell>;

  const posted = s.status === "posted";
  const draftEnd = s.expiresAt - FINAL_MS;
  const expired = s.status === "active" && now > s.expiresAt;
  const lastCall = s.status === "active" && !readOnly && now > draftEnd && !expired;
  const turnsLeft = MAX_TURNS - s.turns;
  const canTalk = s.status === "active" && !readOnly && !s.pending && turnsLeft > 0 && now < draftEnd;
  const attached = s.attachImage !== null ? s.images[s.attachImage] : null;

  // Last call: drafting is over. Just the draft, the clock, and the button.
  if (lastCall || (expired && !posted)) {
    const posting = s.pending?.type === "post";
    return (
      <Shell>
        <div className="max-w-xl mx-auto text-center">
          <p className="smallcaps text-sm text-gold-bright">{expired && !posting ? "session over" : "last call"}</p>
          <div className="font-display text-7xl font-semibold tabular mt-2">{expired && !posting ? "0:00" : clock(s.expiresAt - now)}</div>
          <div className="mt-8 border border-line bg-paper text-ink shadow-xl p-5 text-left">
            <div className="flex items-center gap-3 mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/clawd.jpg" alt="" className="w-10 h-10 rounded-full" />
              <div className="text-sm leading-tight">
                <div className="font-semibold">clawd</div>
                <div className="text-ink-soft">@clawdbotatg</div>
              </div>
            </div>
            {s.draft ? <p className="whitespace-pre-wrap text-[15px] leading-snug">{s.draft}</p> : <p className="text-ink-soft text-sm italic">no draft</p>}
            {attached && attached.status === "ready" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/session/${id}/image/${attached.n}`} alt="" className="mt-3 w-full border border-line" />
            )}
            {s.draft && !expired && (
              <button
                onClick={() => act({ action: "tweet" })}
                disabled={!!s.pending}
                className="mt-5 w-full py-4 bg-ink text-paper smallcaps text-base font-semibold tracking-wider hover:bg-lobster transition-colors disabled:opacity-60"
              >
                {posting ? <Thinking label="safety check, then posting" since={s.pending!.since} /> : "Tweet"}
              </button>
            )}
            {posting && expired && <p className="mt-4 text-sm text-ink-soft"><Thinking label="posting" since={s.pending!.since} /></p>}
          </div>
          {(err || s.notice) && <p className="mt-4 text-sm text-paper border border-paper/40 bg-lobster-deep px-4 py-3">{err || s.notice}</p>}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-8">
        <div>
          <p className="smallcaps text-sm text-gold-bright">{shortAddr(s.wallet)} · {compactCV(s.pricePaid)} CV</p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mt-1">
            {posted ? "Posted." : "Tweet as clawd."}
          </h1>
        </div>
        {!posted && !readOnly && (
          <div className="sm:text-right text-sm">
            <div className={`font-display text-4xl tabular ${draftEnd - now < 5 * 60 * 1000 ? "text-gold-bright" : ""}`}>{clock(draftEnd - now)}</div>
            <div className="smallcaps text-paper/70">to draft · {turnsLeft} messages left</div>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-8 items-start">
        {/* conversation */}
        <div className="border border-line bg-paper text-ink shadow-xl flex flex-col min-h-[28rem]">
          <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[60vh]">
            {readOnly && <p className="text-ink-soft text-sm">Conversation is private.</p>}
            {s.messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "pl-8" : "pr-8"}>
                <div className="smallcaps text-xs text-ink-soft mb-1">{m.role === "user" ? "you" : "clawd 🦞"}</div>
                <div className={`whitespace-pre-wrap text-[15px] leading-relaxed px-4 py-3 border ${m.role === "user" ? "bg-white border-line" : "bg-paper-dark border-line"}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {s.pending?.type === "turn" && (
              <div className="pr-8">
                <div className="smallcaps text-xs text-ink-soft mb-1">clawd 🦞</div>
                <div className="px-4 py-3 border bg-paper-dark border-line text-ink-soft text-sm">
                  <Thinking label="clawd is thinking" since={s.pending.since} />
                </div>
              </div>
            )}
            <div ref={bottom} />
          </div>
          {!posted && !readOnly && (
            <form
              className="border-t border-line p-4 flex gap-3"
              onSubmit={async e => {
                e.preventDefault();
                if (text.trim() && (await act({ action: "message", text }))) setText("");
              }}
            >
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); }
                }}
                placeholder={turnsLeft > 0 ? "what should clawd tweet?" : "out of messages"}
                disabled={!canTalk || expired}
                maxLength={2000}
                rows={2}
                className="flex-1 border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-ink resize-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!canTalk || expired || !text.trim()}
                className="px-5 bg-ink text-paper smallcaps font-semibold hover:bg-lobster transition-colors disabled:opacity-40"
              >
                Send
              </button>
            </form>
          )}
        </div>

        {/* the tweet */}
        <div className="space-y-6">
          <div className="border border-line bg-paper text-ink shadow-xl">
            <div className="border-b border-line bg-paper-dark px-6 py-3 flex justify-between items-baseline">
              <span className="smallcaps text-sm font-semibold text-ink-soft">{posted ? "Posted" : "Draft"}</span>
              {s.draft && !posted && <span className="font-mono text-xs text-ink-soft tabular">{weightedLength(s.draft)}/280</span>}
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/clawd.jpg" alt="" className="w-10 h-10 rounded-full" />
                <div className="text-sm leading-tight">
                  <div className="font-semibold">clawd</div>
                  <div className="text-ink-soft">@clawdbotatg</div>
                </div>
              </div>
              {(posted ? s.tweet?.text : s.draft) ? (
                <p className="whitespace-pre-wrap text-[15px] leading-snug">{posted ? s.tweet!.text : s.draft}</p>
              ) : (
                <p className="text-ink-soft text-sm italic">—</p>
              )}
              {attached && attached.status === "ready" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/session/${id}/image/${attached.n}`} alt={attached.prompt} className="mt-3 w-full border border-line" />
              )}
            </div>

            {posted && s.tweet && (
              <div className="px-5 pb-5">
                <a href={s.tweet.url} target="_blank" rel="noopener noreferrer" className="block text-center w-full py-3 bg-mint text-paper smallcaps font-semibold">
                  View on X →
                </a>
              </div>
            )}

            {!posted && !readOnly && (
              <div className="px-5 pb-5 space-y-3">
                {confirming ? (
                  <div className="border border-seal/50 bg-seal/5 p-3 text-sm space-y-3">
                    <p>Post this{attached ? " with the image" : ""}? No undo.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => { setConfirming(false); await act({ action: "tweet" }); }}
                        className="flex-1 py-2 bg-ink text-paper smallcaps font-semibold hover:bg-lobster"
                      >
                        Tweet
                      </button>
                      <button onClick={() => setConfirming(false)} className="px-4 py-2 border border-line smallcaps">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirming(true)}
                    disabled={!s.draft || !!s.pending || expired}
                    className="w-full py-4 bg-ink text-paper smallcaps text-base font-semibold tracking-wider hover:bg-lobster transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {s.pending?.type === "post" ? <Thinking label="safety check, then posting" since={s.pending.since} /> : "Tweet"}
                  </button>
                )}
                {s.notice && !s.pending && <p className="text-sm text-seal">{s.notice}</p>}
              </div>
            )}
          </div>

          {/* images */}
          {!posted && !readOnly && (
            <div
              className={`border bg-paper text-ink shadow-xl ${dragging ? "border-lobster border-2" : "border-line"}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); if (!s.pending && s.images.filter(i => i.status !== "failed").length < MAX_IMAGES) upload(e.dataTransfer.files[0]); }}
            >
              <div className="border-b border-line bg-paper-dark px-6 py-3 flex justify-between items-baseline">
                <span className="smallcaps text-sm font-semibold text-ink-soft">Image</span>
                <span className="font-mono text-xs text-ink-soft">{s.images.filter(i => i.status !== "failed").length}/{MAX_IMAGES}</span>
              </div>
              <div className="p-5 space-y-3">
                {s.images.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {s.images.map(img => (
                      <button
                        key={img.n}
                        disabled={img.status !== "ready" || !!s.pending}
                        onClick={() => act({ action: "attach", n: s.attachImage === img.n ? null : img.n })}
                        className={`relative aspect-square border-2 ${s.attachImage === img.n ? "border-lobster" : "border-line"} bg-paper-dark text-xs text-ink-soft flex items-center justify-center overflow-hidden`}
                        title={img.prompt}
                      >
                        {img.status === "ready" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/session/${id}/image/${img.n}`} alt={img.prompt} className="w-full h-full object-cover" />
                        ) : img.status === "pending" ? <Thinking label={img.source === "upload" ? "checking" : "painting"} since={s.pending?.type === "image" ? s.pending.since : undefined} /> : img.note || img.status}
                        {s.attachImage === img.n && <span className="absolute top-1 right-1 bg-lobster text-paper px-1.5 smallcaps">attached</span>}
                      </button>
                    ))}
                  </div>
                )}
                {s.images.filter(i => i.status !== "failed").length < MAX_IMAGES && (
                  <>
                    <textarea
                      value={imgPrompt}
                      onChange={e => setImgPrompt(e.target.value)}
                      placeholder="describe the image"
                      rows={2}
                      maxLength={1000}
                      className="w-full border border-line bg-white px-3 py-2 text-sm focus:outline-none focus:border-ink resize-none"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm flex items-center gap-2">
                        <input type="checkbox" checked={withClawd} onChange={e => setWithClawd(e.target.checked)} />
                        feature clawd
                      </label>
                      <button
                        onClick={() => fileInput.current?.click()}
                        disabled={!!s.pending || expired}
                        className="ml-auto text-sm underline text-ink-soft hover:text-ink disabled:opacity-40"
                      >
                        or upload
                      </button>
                      <input
                        ref={fileInput}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }}
                      />
                      <button
                        onClick={() => act({ action: "image", prompt: imgPrompt, withClawd })}
                        disabled={!imgPrompt.trim() || !!s.pending || expired}
                        className="px-4 py-2 bg-ink text-paper smallcaps text-sm font-semibold hover:bg-lobster disabled:opacity-40"
                      >
                        {s.pending?.type === "image" ? <Thinking label="working" /> : "Generate"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {err && (
            <p className="text-sm text-paper border border-paper/40 bg-lobster-deep px-4 py-3">{err}</p>
          )}
          
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <header className="max-w-6xl mx-auto px-6 pt-6 flex items-center justify-between">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight">
          burn<span className="text-gold-bright">·</span>to<span className="text-gold-bright">·</span>tweet
        </Link>
        <a href="https://x.com/clawdbotatg" target="_blank" rel="noopener noreferrer" className="smallcaps text-sm hover:text-gold-bright">@clawdbotatg</a>
      </header>
      <section className="max-w-6xl mx-auto px-6 py-12">{children}</section>
    </main>
  );
}
