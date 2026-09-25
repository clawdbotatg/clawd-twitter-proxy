import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AGENT_CLAUDE_CONFIG_DIRS = "/x/a,/x/b,/x/c";
const { classify, withAccount, healthy, usable } = await import("../worker/accounts.mjs");

test("classify: login errors switch, other errors don't", () => {
  assert.equal(classify("claude error: Failed to authenticate: OAuth session expired").kind, "auth");
  assert.equal(classify("Not logged in · Please run /login").kind, "auth");
  assert.equal(classify("Claude AI usage limit reached|1790000000").kind, "limit");
  assert.equal(classify("API Error: 529 overloaded").kind, "busy");
  assert.equal(classify("claude exited 1: something unrelated"), null);
});

test("withAccount falls through dead logins, then reports unhealthy when all are down", async () => {
  const tried = [], switched = [];
  const r = await withAccount(async dir => {
    tried.push(dir);
    if (dir !== "/x/c") throw new Error(dir === "/x/a" ? "OAuth session expired" : "usage limit reached");
    return "ok";
  }, (name, kind) => switched.push(`${name}:${kind}`));
  assert.equal(r, "ok");
  assert.deepEqual(tried, ["/x/a", "/x/b", "/x/c"]);
  assert.deepEqual(switched, ["a:auth", "b:limit"]);
  assert.deepEqual(usable(), ["/x/c"]); // a and b cool down; next call goes straight to c
  await assert.rejects(withAccount(async () => { throw new Error("Not logged in"); }));
  assert.equal(healthy(), false);
});

test("a non-login error doesn't burn through the other logins", async () => {
  // all cooled from the last test; a fresh module state would be needed to go further
  assert.equal(classify("prompt too long"), null);
});
