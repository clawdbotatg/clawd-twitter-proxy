import Link from "next/link";
import { Addr } from "@/components/Addr";
import { leaderboard } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "creators — burn to tweet", robots: { index: false } };


export default async function Leaderboard() {
  const { creators, tweets } = await leaderboard();
  return (
    <main className="min-h-screen max-w-4xl mx-auto px-6 py-8">
      <Link href="/" className="font-display text-lg font-semibold tracking-tight">
        burn<span className="text-gold-bright">·</span>to<span className="text-gold-bright">·</span>tweet
      </Link>
      <h1 className="font-display text-4xl font-semibold mt-8 mb-6">Creators</h1>

      {creators.length === 0 ? (
        <p className="text-paper/70">No paid tweets yet.</p>
      ) : (
        <table className="w-full text-sm bg-paper text-ink border border-line">
          <thead className="bg-paper-dark text-ink-soft smallcaps">
            <tr><th className="text-left px-4 py-2">#</th><th className="text-left px-4 py-2">creator</th><th className="text-right px-4 py-2">tweets</th><th className="text-right px-4 py-2">score</th></tr>
          </thead>
          <tbody>
            {creators.map((c, i) => (
              <tr key={c.wallet} className="border-t border-line">
                <td className="px-4 py-2 tabular">{i + 1}</td>
                <td className="px-4 py-2"><Addr address={c.wallet} size="sm" /></td>
                <td className="px-4 py-2 text-right tabular">{c.tweets}</td>
                <td className="px-4 py-2 text-right tabular font-semibold">{c.score.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tweets.length > 0 && (
        <>
          <h2 className="font-display text-2xl font-semibold mt-12 mb-4">Tweets</h2>
          <div className="space-y-3">
            {tweets.map(t => {
              const m = t.metrics;
              return (
                <a key={t.tweet_id} href={t.url} target="_blank" rel="noopener noreferrer" className="block bg-paper text-ink border border-line p-4 hover:shadow-xl">
                  <div className="flex justify-between text-xs text-ink-soft font-mono">
                    <span className="flex items-center gap-2">
                      <Addr address={t.wallet} size="xs" disableAddressLink />
                      · {new Date(t.posted_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span className="font-semibold text-ink">{t.score} pts{t.final ? "" : " · live"}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{t.text}</p>
                  {m && (
                    <p className="mt-2 text-xs text-ink-soft font-mono">
                      {m.quotes} quotes · {m.replies} replies · {m.reposts} reposts · {m.likes} likes · {m.bookmarks} bookmarks · {m.profileClicks} profile clicks · {m.impressions.toLocaleString("en-US")} views
                    </p>
                  )}
                </a>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
