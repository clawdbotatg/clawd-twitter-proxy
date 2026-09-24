-- burn to tweet — lives in the `btt` schema of larv.ai's Neon database, owned
-- by the `btt` role, which has NO access to larv.ai's own tables (public.*).
-- Apply with: node tools/migrate.mjs   (idempotent)

CREATE TABLE IF NOT EXISTS price (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  reset_at    bigint NOT NULL,
  start_price bigint NOT NULL
);

-- The whole Session as JSON; `version` is the optimistic-concurrency counter.
CREATE TABLE IF NOT EXISTS sessions (
  id         text PRIMARY KEY,
  wallet     text NOT NULL,
  data       jsonb NOT NULL,
  version    int NOT NULL DEFAULT 0,
  created_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_wallet ON sessions (wallet);

-- Work for the Mac worker. Claimed with DELETE … SKIP LOCKED (one statement).
CREATE TABLE IF NOT EXISTS jobs (
  seq bigserial PRIMARY KEY,
  job jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  session_id text NOT NULL,
  n          int NOT NULL,
  b64        text NOT NULL,
  PRIMARY KEY (session_id, n)
);

CREATE TABLE IF NOT EXISTS feed (
  seq  bigserial PRIMARY KEY,
  item jsonb NOT NULL
);

-- Single row: until when the worker should poll fast.
CREATE TABLE IF NOT EXISTS hot (
  id    int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  until bigint NOT NULL
);

-- Last time the worker polled, and whether Austin paused the desk. No
-- purchases unless the worker is alive and not paused.
CREATE TABLE IF NOT EXISTS worker_status (
  id      int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  seen_at bigint NOT NULL,
  paused  boolean NOT NULL DEFAULT false
);

-- Notifications for Austin (Telegram). The site has no Telegram key, so the
-- worker drains these on each poll and sends them.
CREATE TABLE IF NOT EXISTS events (
  seq  bigserial PRIMARY KEY,
  text text NOT NULL
);

-- Creator score per paid tweet. Metrics are read from X at 1h / 1d / 7d.
CREATE TABLE IF NOT EXISTS tweet_scores (
  tweet_id      text PRIMARY KEY,
  session_id    text NOT NULL,
  wallet        text NOT NULL,
  url           text NOT NULL,
  text          text NOT NULL,
  posted_at     bigint NOT NULL,
  metrics       jsonb,
  score         numeric NOT NULL DEFAULT 0,
  checks        int NOT NULL DEFAULT 0,
  next_check_at bigint
);
CREATE INDEX IF NOT EXISTS tweet_scores_wallet ON tweet_scores (wallet);
CREATE INDEX IF NOT EXISTS tweet_scores_due ON tweet_scores (next_check_at);

-- Purchase attempts (every try, paid or not) — the per-wallet rate limit.
CREATE TABLE IF NOT EXISTS attempts (
  wallet text NOT NULL,
  at     bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_wallet_at ON attempts (wallet, at);
