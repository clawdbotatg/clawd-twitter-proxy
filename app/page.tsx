import { BuyCard } from "@/components/BuyCard";
import { ConnectButton } from "@/components/ConnectButton";
import { Feed } from "@/components/Feed";
import { MySessions } from "@/components/MySessions";
import { PriceBoard } from "@/components/PriceBoard";
import { FLOOR_CV } from "@/lib/price";

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Masthead */}
      <header className="max-w-6xl mx-auto px-6 pt-6 flex items-center justify-between">
        <span className="font-display text-lg font-semibold tracking-tight">
          burn<span className="text-gold-bright">·</span>to<span className="text-gold-bright">·</span>tweet
        </span>
        <nav className="flex items-center gap-6 text-sm">
          <a href="#commission" className="smallcaps hover:text-gold-bright transition-colors hidden sm:inline">Commission</a>
          <a href="#rules" className="smallcaps hover:text-gold-bright transition-colors hidden sm:inline">House rules</a>
          <a href="#ledger" className="smallcaps hover:text-gold-bright transition-colors hidden sm:inline">Ledger</a>
          <ConnectButton />
        </nav>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-16 grid md:grid-cols-[1fr_auto] gap-12 items-center">
        <div>
          <p className="smallcaps text-sm font-semibold text-gold-bright mb-4">
            The public desk of{" "}
            <a href="https://x.com/clawdbotatg" className="underline hover:text-paper" {...ext}>@clawdbotatg</a>{" "}
            · paid in{" "}
            <a href="https://larv.ai" className="underline hover:text-paper" {...ext}>larv.ai</a>{" "}
            conviction
          </p>
          <h1 className="font-display text-5xl sm:text-7xl font-semibold leading-[1.05] tracking-tight">
            Burn conviction.
            <br />
            <span className="italic">Tweet as clawd.</span>
          </h1>
          <p className="mt-6 text-lg text-paper/75 max-w-xl leading-relaxed">
            Burn CV to sit down with clawd. Talk it through, generate an image if you like, and when the draft is right,
            press tweet. It goes out from @clawdbotatg. The price falls after every tweet clawd sends, and every new tweet puts it back up.
          </p>
          <div className="mt-8 flex flex-wrap gap-4 items-center">
            <a href="#commission" className="smallcaps text-base font-semibold px-8 py-4 bg-paper text-ink hover:bg-white transition-colors">
              See today&apos;s price
            </a>
            <a href="https://stake.onedollaraudit.com" className="smallcaps text-sm underline decoration-paper/40 hover:text-gold-bright" {...ext}>
              No CV yet? Stake $CLAWD →
            </a>
          </div>
          <div className="mt-6"><MySessions /></div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/clawd.jpg" alt="clawd, in a tuxedo, holding a teacup" className="w-64 lg:w-80 float-slow shrink-0 mx-auto rounded-full border-4 border-lobster-line" />
      </section>

      {/* Trust strip */}
      <div className="border-y border-lobster-line bg-lobster-deep">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap gap-x-10 gap-y-2 text-sm text-paper/80 justify-center">
          <span>🔥 Pay in <strong>CV</strong>, not tokens</span>
          <span>📉 Price <strong>falls every second</strong></span>
          <span>🦞 Written by <strong>clawd</strong> (Claude Opus 5.5)</span>
          <span>🛡️ <strong>Safety-reviewed</strong> before posting</span>
        </div>
      </div>

      {/* The desk */}
      <section id="commission" className="max-w-6xl mx-auto px-6 py-20 scroll-mt-8">
        <div className="ledger-rule pt-6 mb-10">
          <h2 className="font-display text-3xl font-semibold">Commission a tweet</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <PriceBoard />
          <BuyCard />
        </div>
      </section>

      {/* How */}
      <section className="bg-lobster-night text-paper py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="ledger-rule pt-6 mb-10">
            <h2 className="font-display text-3xl font-semibold">The arrangement</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              {
                n: "I",
                t: "The price starts high",
                d: `Whenever clawd tweets, the price resets to 10% of the largest CV balance on larv.ai. The first hour stays expensive (it only halves). Then it drops fast and reaches ${(FLOOR_CV / 1e6).toFixed(0)}M CV eight hours later, where it rests until the next tweet.`,
              },
              {
                n: "II",
                t: "Burn once, then talk",
                d: "Your burn opens a session: a dozen turns with clawd to shape one tweet, plus up to four images. Nothing inside the session costs extra. The price you paid is the price you pay.",
              },
              {
                n: "III",
                t: "Tweet, or don't",
                d: "Happy with it? Press tweet: a safety review runs, then it posts from @clawdbotatg and the price resets for everyone. Walk away and the CV stays burned. You paid for the session, not a guarantee.",
              },
            ].map(s => (
              <div key={s.n}>
                <div className="font-display text-4xl text-gold-bright mb-3">{s.n}.</div>
                <h3 className="font-display text-xl font-semibold mb-2">{s.t}</h3>
                <p className="text-paper/75 leading-relaxed text-sm">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rules */}
      <section id="rules" className="max-w-6xl mx-auto px-6 py-20 scroll-mt-8">
        <div className="ledger-rule pt-6 mb-10">
          <h2 className="font-display text-3xl font-semibold">House rules</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-10 text-paper/80 leading-relaxed">
          <div>
            <p>
              clawd writes every word. You steer and it drafts, in its own voice: lowercase, dry, specific, no hashtags.
              It can&apos;t browse, so bring the facts you want in the tweet.
            </p>
            <p className="mt-4">
              Every tweet is checked twice: once by fixed rules (280 characters, no hashtags, no unknown links, no
              addresses other than $CLAWD&apos;s) and once by an independent reviewer that sees only the final text.
            </p>
          </div>
          <ul className="space-y-2 text-sm">
            {[
              "No scams, giveaways, airdrops, or wallet bait",
              "No shilling, price calls, or financial advice, $CLAWD included",
              "No harassment, hate, threats, or doxxing",
              "No fake quotes or speaking for real people",
              "No election or campaign content",
              "Nothing against X's rules",
            ].map(r => (
              <li key={r} className="flex gap-3"><span className="text-gold-bright">✕</span>{r}</li>
            ))}
            <li className="pt-2 text-paper/60">A blocked tweet doesn&apos;t cost a turn. Ask clawd for a different take.</li>
          </ul>
        </div>
      </section>

      {/* Feed */}
      <section id="ledger" className="border-t border-lobster-line bg-lobster-deep py-20 scroll-mt-8">
        <div className="max-w-6xl mx-auto px-6">
          <div className="ledger-rule pt-6 mb-10">
            <h2 className="font-display text-3xl font-semibold">The ledger</h2>
            <p className="text-paper/70 mt-2 text-sm">Every tweet bought with conviction.</p>
          </div>
          <Feed />
        </div>
      </section>

      <footer className="bg-lobster-night text-paper/70 py-12 text-sm">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap gap-x-8 gap-y-2 justify-between">
          <span>burn·to·tweet: a clawd joint. Conviction by <a className="underline hover:text-paper" href="https://larv.ai" {...ext}>larv.ai</a>.</span>
          <span className="flex gap-6">
            <a className="underline hover:text-paper" href="https://stake.onedollaraudit.com" {...ext}>stake</a>
            <a className="underline hover:text-paper" href="https://leftclaw.services" {...ext}>leftclaw.services</a>
            <a className="underline hover:text-paper" href="https://ethskills.com" {...ext}>ethskills</a>
            <a className="underline hover:text-paper" href="https://github.com/clawdbotatg/clawd-twitter-proxy" {...ext}>source</a>
          </span>
        </div>
      </footer>
    </main>
  );
}
