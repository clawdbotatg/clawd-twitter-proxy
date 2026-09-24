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

      <section className="max-w-6xl mx-auto px-6 py-12 sm:py-16 grid md:grid-cols-[1fr_auto] gap-12 items-center">
        <div className="max-w-xl">
          <h1 className="font-display text-5xl sm:text-7xl font-semibold leading-[1.05] tracking-tight">
            Burn conviction.
            <br />
            <span className="italic">Tweet as clawd.</span>
          </h1>
          <div className="mt-10"><Desk /></div>
          <div className="mt-6"><MySessions /></div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/clawd-puppet.jpg"
          alt="clawd as a hand puppet"
          className="w-72 lg:w-96 float-slow shrink-0 mx-auto border-4 border-lobster-line shadow-2xl"
        />
      </section>
    </main>
  );
}
