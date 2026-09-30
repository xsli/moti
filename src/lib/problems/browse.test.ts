import assert from "node:assert/strict";
import { test } from "node:test";
import { orderBrowseProblems } from "./browse.ts";
import type { Problem } from "./types";

function problem(id: string, collectionId?: string, sourceOrder = 1): Problem {
  return { id, collectionId, sourceOrder, createdAt: 1, sourceBatchId: collectionId } as Problem;
}

test("orders the full browse list by collection and source before pagination", () => {
  const input = [problem("a2", "a", 2), problem("b1", "b"), problem("a1", "a")];
  const ordered = orderBrowseProblems(input, ["b", "empty", "a"]);
  assert.deepEqual(ordered.map((p) => p.id), ["b1", "a1", "a2"]);
  assert.deepEqual(ordered.slice(0, 2).map((p) => p.id), ["b1", "a1"]);
  assert.deepEqual(ordered.slice(2).map((p) => p.id), ["a2"]);
  assert.deepEqual(input.map((p) => p.id), ["a2", "b1", "a1"]);
});

test("retains ungrouped and orphaned problems at the end of the browse list", () => {
  const input = [problem("loose"), problem("orphan", "missing"), problem("known", "a")];
  assert.deepEqual(orderBrowseProblems(input, ["a"]).map((p) => p.id), ["known", "loose", "orphan"]);
  assert.deepEqual(orderBrowseProblems([], []).map((p) => p.id), []);
});
