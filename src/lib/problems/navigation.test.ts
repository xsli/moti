import assert from "node:assert/strict";
import { test } from "node:test";
import { navigationPosition } from "./navigation.ts";

test("keeps the filtered list order", () => {
  assert.deepEqual(navigationPosition(["c", "a", "b"], "a", ["a", "b", "c", "d"]), {
    index: 1, total: 3, previous: "c", next: "b",
  });
});
test("disables navigation at boundaries and for a single question", () => {
  assert.equal(navigationPosition(["a", "b"], "a", ["a", "b"]).previous, undefined);
  assert.equal(navigationPosition(["a", "b"], "b", ["a", "b"]).next, undefined);
  assert.deepEqual(navigationPosition(["a"], "a", ["a"]), { index: 0, total: 1, previous: undefined, next: undefined });
});
test("skips deleted records and duplicates without adding unrelated questions", () => {
  assert.deepEqual(navigationPosition(["a", "deleted", "a", "b"], "a", ["a", "b", "c"]), {
    index: 0, total: 2, previous: undefined, next: "b",
  });
});
test("missing current record does not navigate to an unrelated record", () => {
  assert.equal(navigationPosition(["a"], "missing", ["a"]).next, undefined);
});
