import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCheckAt, scoreOf } from "../lib/score.ts";

const zero = { likes: 0, reposts: 0, replies: 0, quotes: 0, bookmarks: 0, impressions: 0, profileClicks: 0, linkClicks: 0 };

test("weights: quote 8, profile click 5, reply 4, repost/bookmark/link 1, like 0.5, 1 per 1k views", () => {
  assert.equal(scoreOf({ ...zero, quotes: 1 }), 8);
  assert.equal(scoreOf({ ...zero, profileClicks: 1 }), 5);
  assert.equal(scoreOf({ ...zero, replies: 1 }), 4);
  assert.equal(scoreOf({ ...zero, reposts: 1, bookmarks: 1, linkClicks: 1 }), 3);
  assert.equal(scoreOf({ ...zero, likes: 3 }), 1.5);
  assert.equal(scoreOf({ ...zero, impressions: 12_345 }), 12.3);
});

test("replies and quotes are capped", () => {
  assert.equal(scoreOf({ ...zero, replies: 10_000 }), 800);
  assert.equal(scoreOf({ ...zero, quotes: 10_000 }), 800);
});

test("reads every 30 min for 6h, every 3h to a day, daily to 7 days, then final", () => {
  const H = 3600e3;
  assert.equal(nextCheckAt(0, 0), H / 2);
  assert.equal(nextCheckAt(0, 5 * H), 5.5 * H);
  assert.equal(nextCheckAt(0, 7 * H), 10 * H);
  assert.equal(nextCheckAt(0, 30 * H), 54 * H);
  assert.equal(nextCheckAt(0, 160 * H), 168 * H); // last read lands exactly at 7 days
  assert.equal(nextCheckAt(0, 168 * H), null);
});
