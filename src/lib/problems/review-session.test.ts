import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReviewQueue } from "./review-session.ts";
import type { Collection } from "./collections";
import type { Problem } from "./types";

const collections = [{ id: "a", groupName: "book" }, { id: "b", groupName: "book" }, { id: "c", groupName: "" }] as Collection[];
const due = Array.from({ length: 75 }, (_, i) => ({ id: `p${i}`, collectionId: i < 30 ? "a" : i < 60 ? "b" : i < 70 ? "c" : undefined })) as Problem[];

test("review sessions preserve due order and enforce the selected size", () => {
  assert.deepEqual(buildReviewQueue(due, collections, { limit: 20 }), due.slice(0, 20).map((p) => p.id));
  assert.equal(buildReviewQueue(due, collections, { limit: 1000 }).length, 50);
  assert.equal(buildReviewQueue(due, collections, { limit: NaN }).length, 20);
  assert.equal(buildReviewQueue(due, collections, { limit: 0 }).length, 1);
});
test("review folder and chapter filters intersect, including an unnamed folder", () => {
  assert.deepEqual(buildReviewQueue(due, collections, { folder: "book", group: "b", limit: 50 }), due.slice(30, 60).map((p) => p.id));
  assert.equal(buildReviewQueue(due, collections, { folder: "book", group: "c", limit: 20 }).length, 0);
  assert.deepEqual(buildReviewQueue(due, collections, { folder: "", limit: 50 }), due.slice(60, 70).map((p) => p.id));
  assert.deepEqual(buildReviewQueue([], collections, { limit: 20 }), []);
  assert.equal(due.length, 75);
});
