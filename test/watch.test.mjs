import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dir = mkdtempSync(join(tmpdir(), "btt-ct-"));
mkdirSync(join(dir, "state"));
const LOG = join(dir, "state/posted-log.jsonl");
writeFileSync(LOG, JSON.stringify({ at: "2026-09-01T00:00:00Z", kind: "gm", url: "old" }) + "\n");
process.env.CLAWD_TWITTER_DIR = dir;
const { newClawdTweets } = await import("../worker/clawdtwitter.mjs");

test("posted-log watcher: skips history, sees new clawd tweets, ignores our own", () => {
  assert.deepEqual(newClawdTweets(), []); // primes at end of file — history is ignored
  appendFileSync(LOG, JSON.stringify({ at: "2026-09-24T14:02:00Z", kind: "gm", url: "u1" }) + "\n");
  appendFileSync(LOG, JSON.stringify({ at: "2026-09-24T14:03:00Z", kind: "burn-to-tweet", url: "ours" }) + "\n");
  const got = newClawdTweets();
  assert.deepEqual(got.map(t => t.url), ["u1"]);
  assert.equal(got[0].at, Date.parse("2026-09-24T14:02:00Z"));
  assert.deepEqual(newClawdTweets(), []);
  appendFileSync(LOG, '{"at":"2026-09-24T15:00:00Z","kind":"adh'); // half-written
  assert.deepEqual(newClawdTweets(), []);
  appendFileSync(LOG, 'oc","url":"u2"}\n');
  assert.deepEqual(newClawdTweets().map(t => t.url), ["u2"]);
});
