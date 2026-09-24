# burn to tweet

**Burn CV to rent @clawdbotatg's pen for one tweet.**

Someone burns ClawdViction (CV, the conviction points $CLAWD stakers earn on
[larv.ai](https://larv.ai)) to open a session with clawd. They get 12 turns
with Claude Opus 5.5 to shape one tweet and up to 4 gpt-image images. When
they're happy they press **tweet**. It passes a safety review and posts from
[@clawdbotatg](https://x.com/clawdbotatg). They can also walk away; the burn
is final either way.

## The price

A Dutch auction that restarts on every tweet:

- When a tweet posts, the price resets to **10% of the largest CV balance**
  in larv.ai's ledger (`GET larv.ai/api/cv/highest`).
- It decays exponentially and lands on **50M CV** after 24 hours, then rests
  there until someone tweets.
- Buying a session doesn't reset it. Only a posted tweet does. Parallel
  buyers are fine, because the price is the throttle.

`lib/price.ts` is the whole curve; `test/price.test.mjs` pins it.

## Architecture

```
browser ──► Next.js on Vercel ──► Upstash Redis (ctp:*)
              │  /api/session  burn CV via larv.ai /api/cv/spend
              │  /api/worker/* job queue (bearer WORKER_SECRET)
              ▼
        worker on the Mac (outbound-only poller, launchd)
              ├─ turn  → claude -p (Opus 5.5), fully isolated → reply + draft
              ├─ image → reviewer checks prompt → gpt-image → JPEG
              └─ post  → guard + reviewer on exact text → X API → price resets
```

- **Why a Mac worker:** clawd runs as `claude -p` on the subscription, which
  only exists on this machine. The worker only makes outbound calls, so
  nothing is exposed.
- **The isolated agent** (`worker/claude.mjs`) has no tools (`--tools ""`),
  no MCP, no settings, no CLAUDE.md, no memory and no session persistence.
  Its env is built from scratch, so the worker's Twitter, OpenAI and worker
  keys never reach it, and it runs from an empty scratch dir. Its only
  memory is `agent/CLAWD.md`: who clawd is, the voice, the ecosystem, and
  the hard lines. One residual: Claude Code injects the logged-in account's
  email into context, and no switch turns that off. The persona tells clawd
  never to repeat it, and a live jailbreak test didn't leak it.
- **Safety, twice:** `worker/guard.mjs` applies deterministic rules: 280
  weighted chars, no hashtags, links only to allowlisted domains, no
  addresses except $CLAWD's, no phishing bait. `worker/safety.mjs` is an
  independent reviewer (`agent/REVIEWER.md`) that sees only the final text.
  It fails closed. Image prompts are reviewed before generation too.
- **A session posts at most once:** `worker/state/posted.json` is the
  worker's ledger, and results retry until they land.

## Run locally

```bash
npm install && (cd worker && npm install)
# site: needs UPSTASH_REDIS_REST_URL/TOKEN (or KV_REST_API_*), CV_SPEND_SECRET, WORKER_SECRET
KEY_PREFIX=ctp-dev: DEV_FAKE_SPEND=1 npm run dev          # fake spend works only in dev builds
# worker:
cp worker/.env.example worker/.env                          # API_BASE=http://localhost:3000
DRY_RUN_POST=1 node worker/worker.mjs                       # never posts to X
npm test
```

Deploy: Vercel (zero config) with env `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `CV_SPEND_SECRET`, `WORKER_SECRET`. Worker:
`tools/install-worker.sh`.
