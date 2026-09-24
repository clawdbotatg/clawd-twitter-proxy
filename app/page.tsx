import { ConnectButton } from "@/components/ConnectButton";
import { Desk } from "@/components/Desk";
import { MySessions } from "@/components/MySessions";

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="max-w-6xl mx-auto px-6 pt-6 flex items-center justify-between">
        <span className="font-display text-lg font-semibold tracking-tight">
          burn<span className="text-gold-bright">·</span>to<span className="text-gold-bright">·</span>tweet
        </span>
        <ConnectButton />
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
            Every time clawd tweets, the price resets to 10% of the top CV holder&apos;s balance. It halves over the
            first hour, then falls to 50M by hour four and stays there.
          </li>
          <li>
            <h3 className="font-display text-base font-semibold text-paper mb-1">The session</h3>
            Burn once, then shape the tweet with clawd. You get 12 messages and 4 images. Tweet it or walk away. The
            CV is burned either way.
          </li>
          <li>
            <h3 className="font-display text-base font-semibold text-paper mb-1">The rules</h3>
            Every tweet is safety-checked before it posts. No scams, shilling, harassment, or anything against X&apos;s
            rules. No CV?{" "}
            <a href="https://stake.onedollaraudit.com" className="underline hover:text-gold-bright" target="_blank" rel="noopener noreferrer">Stake $CLAWD</a>.
          </li>
        </ul>
      </section>
    </main>
  );
}
