import assert from "node:assert/strict";
import { test } from "node:test";
import { folderSummaries } from "./folders.ts";

test("summarizes only the collections belonging to each folder", () => {
  const result = folderSummaries([
    { id: "a1", groupName: "Book A" },
    { id: "a2", groupName: " Book A " },
    { id: "b1", groupName: "Book B" },
  ], [
    { collectionId: "a1", mastery: "mastered", nextReviewAt: 0 },
    { collectionId: "a2", mastery: "new", nextReviewAt: 0 },
    { collectionId: "a2", mastery: "reviewing", nextReviewAt: 200 },
    { collectionId: "b1", mastery: "reviewing", nextReviewAt: 50 },
    { collectionId: undefined, mastery: "new", nextReviewAt: 0 },
    { collectionId: "deleted", mastery: "new", nextReviewAt: 0 },
  ], 100);
  assert.deepEqual(result, [
    { name: "Book A", groups: 2, total: 3, due: 1, mastered: 1 },
    { name: "Book B", groups: 1, total: 1, due: 1, mastered: 0 },
  ]);
});

test("keeps empty folders visible and puts unnamed folders last", () => {
  assert.deepEqual(folderSummaries([
    { id: "loose", groupName: " " },
    { id: "empty", groupName: "Book A" },
  ], [{ collectionId: "loose", mastery: "new", nextReviewAt: 0 }], 100), [
    { name: "Book A", groups: 1, total: 0, due: 0, mastered: 0 },
    { name: "", groups: 1, total: 1, due: 1, mastered: 0 },
  ]);
  assert.deepEqual(folderSummaries([], []), []);
});
