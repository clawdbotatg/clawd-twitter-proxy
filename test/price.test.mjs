import { test } from "node:test";
import assert from "node:assert/strict";
import { DECAY_MS, FALL_MS, FLOOR_CV, HOLD_MS, priceAt, startPriceFor } from "../lib/price.ts";

test("reset price is 10% of the top holder, never below the floor", () => {
  assert.equal(startPriceFor(13_224_636_146), 1_322_463_615);
  assert.equal(startPriceFor(100_000_000), FLOOR_CV);
  assert.equal(startPriceFor(0), FLOOR_CV);
});

test("first hour only halves (10% → 5%), then falls to the floor over 5h and rests", () => {
  const s = { resetAt: 1_000_000, startPrice: 1_320_000_000 };
  assert.equal(priceAt(s, s.resetAt), 1_320_000_000);
  assert.equal(priceAt(s, s.resetAt + HOLD_MS), 660_000_000);
  assert.ok(priceAt(s, s.resetAt + HOLD_MS / 2) > 900_000_000, "still expensive mid-hour");
  assert.equal(priceAt(s, s.resetAt + HOLD_MS + FALL_MS), FLOOR_CV);
  assert.equal(priceAt(s, s.resetAt + 3 * DECAY_MS), FLOOR_CV);
  // after the hour it drops fast: well under half of the hour-mark price 90 min later
  assert.ok(priceAt(s, s.resetAt + HOLD_MS + 90 * 60 * 1000) < 330_000_000);
});

test("a low reset price never dips under the floor", () => {
  const s = { resetAt: 0, startPrice: 80_000_000 };
  assert.equal(priceAt(s, HOLD_MS), FLOOR_CV);
  assert.equal(priceAt(s, 2 * HOLD_MS), FLOOR_CV);
});

test("monotonically non-increasing between resets", () => {
  const s = { resetAt: 0, startPrice: 900_000_000 };
  let prev = Infinity;
  for (let t = 0; t <= DECAY_MS + 60_000; t += 60_000) {
    const p = priceAt(s, t);
    assert.ok(p <= prev, `rose at t=${t}`);
    assert.ok(Number.isInteger(p));
    prev = p;
  }
});

test("clock skew before reset doesn't exceed the start", () => {
  const s = { resetAt: 10_000, startPrice: 500_000_000 };
  assert.equal(priceAt(s, 0), 500_000_000);
});
