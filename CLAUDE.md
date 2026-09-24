# burn to tweet: orientation for Claude

Read `README.md` for the product and architecture. These are the rules.

## Hard rules

1. **The agent stays isolated.** `worker/claude.mjs` spawns clawd with no
   tools, no MCP, no settings, no CLAUDE.md or memory, and an env built from
   scratch. Never pass `process.env` through, never add a tool, never point
   its cwd at a real directory. Every prompt comes from an anonymous
   stranger. `test/worker.test.mjs` enforces the env and args.
2. **Safety fails closed.** The reviewer blocks on anything but a clean
   `{"verdict":"allow"}`. Don't loosen `guard.mjs` (allowlisted links,
   $CLAWD-only addresses, no hashtags) without Austin.
3. **A session posts at most once.** The worker ledger
   (`worker/state/posted.json`) plus result retries guarantee it. The result
   route records a landed post even when the job looks stale.
4. **No secrets in this repo (it's PUBLIC).** Twitter and OpenAI keys live in
   `../clawd-twitter/.env`, read at runtime by `worker/env.mjs`. Site secrets
   live in Vercel env. `worker/.env` is gitignored.
5. **Posting from @clawdbotatg here is a standing authorization from Austin
   (2026-09-23)** for this service only: stranger-steered, clawd-written,
   safety-reviewed. It does not relax clawd-twitter's "posting needs
   approval" rule for anything else.
6. Test with `DEV_FAKE_SPEND=1` (dev builds only) and `DRY_RUN_POST=1` on
   the worker. Never exercise the real spend or post paths in a test. Tests
   share the prod tables, so run them before launch or clean up the rows.
7. **The database is larv.ai's Neon, schema `btt`, role `btt`.** That role
   can't touch larv.ai's tables (CV balances); keep it that way. Never use
   larv.ai's owner URL in this app. Schema: `tools/schema.sql`.

## Where things are

- `lib/price.ts`: the auction curve (10% of top holder, down to 50M over 24h)
- `lib/store.ts`: Postgres access (sessions, job queue, price, feed, hot flag)
- `lib/larv.ts`: larv.ai oracle and CV spend
- `app/api/session/[id]`: user actions (message / image / attach / tweet)
- `app/api/worker/{claim,result}`: the worker's side of the queue
- `worker/`: the Mac process. `agent/`: clawd's memory and the reviewer's brief.
