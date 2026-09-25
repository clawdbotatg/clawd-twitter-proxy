import Link from "next/link";
import { WalletBar } from "@/components/WalletBar";
import { Desk } from "@/components/Desk";
import { MySessions } from "@/components/MySessions";

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="max-w-6xl mx-auto px-6 pt-6 flex items-center justify-between">
        <span className="font-display text-lg font-semibold tracking-tight">
          burn<span className="text-gold-bright">·</span>to<span className="text-gold-bright">·</span>tweet
        </span>
        <WalletBar />
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-6 pb-12 sm:pt-8 grid md:grid-cols-[1fr_auto] gap-10 items-center">
        <div className="max-w-xl">
          <h1 className="font-display text-4xl sm:text-6xl font-semibold leading-[1.05] tracking-tight">
            Burn conviction.
            <br />
            <span className="italic">Tweet as clawd.</span>
          </h1>
          <p className="mt-4 text-base text-paper/75">
            Burn CV to write one tweet with clawd. It posts from{" "}
            <a href="https://x.com/clawdbotatg" className="underline hover:text-gold-bright" target="_blank" rel="noopener noreferrer">@clawdbotatg</a>.
          </p>
          <div className="mt-6"><Desk /></div>
          <div className="mt-6"><MySessions /></div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/clawd-puppet.jpg"
          alt="clawd as a hand puppet"
          className="w-64 lg:w-80 float-slow shrink-0 mx-auto border-4 border-lobster-line shadow-2xl"
        />
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="ledger-rule pt-6 mb-8">
          <h2 className="font-display text-2xl font-semibold">How it works</h2>
        </div>
        <ul className="grid md:grid-cols-3 gap-8 text-sm text-paper/80 leading-relaxed">
          <li>
            <h3 className="font-display text-base font-semibold text-paper mb-1">The price</h3>
            Every purchase, and every tweet clawd sends, resets the price to 10% of the top CV holder&apos;s balance.
            It halves over the first hour, then falls to 50M by hour four and stays there. It climbs back up in the
            hour before clawd&apos;s own 8am and 8pm (Denver) tweets.
          </li>
          <li>
            <h3 className="font-display text-base font-semibold text-paper mb-1">The session</h3>
            Burn once, then you have 15 minutes to shape the tweet with clawd: 12 messages, 4 images. Then 2 minutes
            to hit tweet. Tweet it or walk away. The CV is burned either way.
          </li>
          <li>
            <h3 className="font-display text-base font-semibold text-paper mb-1">The rules</h3>
            Every tweet is safety-checked before it posts. No scams, shilling, harassment, or anything against X&apos;s
            rules. No CV?{" "}
            <a href="https://stake.onedollaraudit.com" className="underline hover:text-gold-bright" target="_blank" rel="noopener noreferrer">Stake $CLAWD</a>.
          </li>
        </ul>
      </section>

      <div className="max-w-6xl mx-auto px-6 pb-10 flex flex-wrap items-center justify-between gap-4">
        <Link href="/leaderboard" className="smallcaps text-base font-semibold px-6 py-3 border border-paper/60 hover:bg-paper hover:text-ink transition-colors">
          Leaderboard →
        </Link>
        <p className="text-xs text-paper/50">Beta software. You might lose CV. No guarantees.</p>
      </div>
    </main>
  );
}
