import assert from "node:assert/strict";
import { test } from "node:test";
import { BASKET_MAX, emptySession, replaceBasket, parseSession, mergeSession } from "./session.ts";

test("unified paper selection persists more than the old 80-item basket", () => {
  const ids = Array.from({ length: 150 }, (_, i) => `p${i}`);
  const next = replaceBasket(emptySession(), ids);
  assert.deepEqual(parseSession(JSON.parse(JSON.stringify(next))).basket, ids);
  assert.equal(replaceBasket(next, ids), next);
});
test("replacing and removing selections cannot resurrect older choices", () => {
  const old = replaceBasket(emptySession(), ["a", "b", "c"]);
  const next = replaceBasket(old, ["b", "b"]);
  assert.deepEqual(next.basket, ["b"]);
  assert.deepEqual(mergeSession(old, next).basket, ["b"]);
  const cleared = replaceBasket(next, []);
  assert.deepEqual(mergeSession(cleared, old).basket, []);
  assert.deepEqual(old.basket, ["a", "b", "c"]);
  assert.throws(() => replaceBasket(old, Array.from({ length: BASKET_MAX + 1 }, (_, i) => `${i}`)), /最多/);
});
