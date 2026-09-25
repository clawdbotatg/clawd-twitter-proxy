import { test } from "node:test";
import assert from "node:assert/strict";
import { DECAY_MS, FALL_MS, FLOOR_CV, HOLD_MS, decayAt, priceAt, startPriceFor } from "../lib/price.ts";

test("reset price is 10% of the top holder, never below the floor", () => {
  assert.equal(startPriceFor(13_224_636_146), 1_322_463_615);
  assert.equal(startPriceFor(100_000_000), FLOOR_CV);
  assert.equal(startPriceFor(0), FLOOR_CV);
});

test("first hour only halves (10% → 5%), then falls to the floor over 3h and rests", () => {
  const s = { resetAt: 1_000_000, startPrice: 1_320_000_000 };
  assert.equal(decayAt(s, s.resetAt), 1_320_000_000);
  assert.equal(decayAt(s, s.resetAt + HOLD_MS), 660_000_000);
  assert.ok(decayAt(s, s.resetAt + HOLD_MS / 2) > 900_000_000, "still expensive mid-hour");
  assert.equal(decayAt(s, s.resetAt + HOLD_MS + FALL_MS), FLOOR_CV);
  assert.equal(decayAt(s, s.resetAt + 3 * DECAY_MS), FLOOR_CV);
  // after the hour: a steady exponential fall — geometric midpoint halfway down
  const mid = decayAt(s, s.resetAt + HOLD_MS + FALL_MS / 2);
  assert.ok(Math.abs(mid - Math.sqrt(660_000_000 * FLOOR_CV)) < 2);
});

test("a low reset price never dips under the floor", () => {
  const s = { resetAt: 0, startPrice: 80_000_000 };
  assert.equal(decayAt(s, HOLD_MS), FLOOR_CV);
  assert.equal(decayAt(s, 2 * HOLD_MS), FLOOR_CV);
});

test("monotonically non-increasing between resets", () => {
  const s = { resetAt: 0, startPrice: 900_000_000 };
  let prev = Infinity;
  for (let t = 0; t <= DECAY_MS + 60_000; t += 60_000) {
    const p = decayAt(s, t);
    assert.ok(p <= prev, `rose at t=${t}`);
    prev = p;
  }
});

test("clock skew before reset doesn't exceed the start", () => {
  const s = { resetAt: 10_000, startPrice: 500_000_000 };
  assert.equal(decayAt(s, 0), 500_000_000);
});

import { scheduledRamp } from "../lib/price.ts";

// 2026-09-25 is MDT (UTC-6): 8:02am Denver = 14:02 UTC, 8:02pm = 02:02 UTC next day.
const at = (h, m) => Date.UTC(2026, 8, 25, h, m);

test("the hour before clawd's 8:02am / 8:02pm tweets climbs back to the reset price", () => {
  const s = { resetAt: at(0, 0), startPrice: 1_320_000_000 }; // reset long ago → sitting at the floor
  assert.equal(priceAt(s, at(12, 30)), FLOOR_CV);          // 6:30am: no ramp
  assert.equal(scheduledRamp(at(12, 30)), null);
  const mid = priceAt(s, at(13, 32));                       // 7:32am: halfway up
  assert.ok(Number.isInteger(mid));
  assert.ok(Math.abs(mid - Math.sqrt(FLOOR_CV * 1_320_000_000)) < 2);
  assert.equal(priceAt(s, at(14, 2)), 1_320_000_000);       // 8:02am: full price
  assert.equal(priceAt(s, at(14, 15)), 1_320_000_000);      // holding
  assert.equal(priceAt(s, at(14, 20)), FLOOR_CV);           // no tweet came: back to the curve
  assert.equal(priceAt(s, at(26, 2)), 1_320_000_000);       // 8:02pm (next UTC day)
});

test("the ramp never lowers a price that's already high", () => {
  const s = { resetAt: at(13, 50), startPrice: 1_320_000_000 }; // someone bought at 7:50am
  assert.equal(priceAt(s, at(13, 50)), 1_320_000_000);
  assert.ok(priceAt(s, at(14, 0)) >= priceAt({ ...s, resetAt: 0 }, at(14, 0)) - 1);
});
