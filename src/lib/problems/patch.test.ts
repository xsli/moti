import assert from "node:assert/strict";
import { test } from "node:test";
import { problemPatchFields } from "./patch.ts";
import type { Problem } from "./types";

const cleaned = {
  mastery: "mastered", tags: ["例题"], collectionId: undefined,
  sourceOrder: 3, sourceBatchId: "order:group", figures: [], sourceImage: undefined,
} as unknown as Problem;

test("metadata edits never write omitted image fields", () => {
  assert.deepEqual(problemPatchFields({ mastery: "mastered" }, cleaned), [["mastery", "mastered"]]);
  assert.deepEqual(problemPatchFields({ tags: ["例题"] }, cleaned), [["tags_json", '["例题"]']]);
  assert.deepEqual(problemPatchFields({ collectionId: undefined }, cleaned), [["collection_id", null]]);
});

test("reordering does not write media or other problem content", () => {
  assert.deepEqual(problemPatchFields({ sourceOrder: 3, sourceBatchId: "order:group" }, cleaned),
    [["source_batch_id", "order:group"], ["source_order", 3]]);
});

test("explicitly removing all figures or the source image is still supported", () => {
  assert.deepEqual(problemPatchFields({ figures: [] }, cleaned), [["figures_json", "[]"]]);
  assert.deepEqual(problemPatchFields({ sourceImage: undefined }, cleaned), [["source_image", null]]);
});

test("identity, timestamps and unknown SQL columns cannot be patched", () => {
  assert.deepEqual(problemPatchFields({ id: "other", createdAt: 0, updatedAt: 0, user_id: "other", "title = null": "x" }, cleaned), []);
});
