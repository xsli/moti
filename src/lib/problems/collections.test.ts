import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coerceCollection, defaultCollectionName, mergeCollections, sortCollectionsByOrder } from "./collections.ts";
import { moveId, sortBySourceOrder, spliceVisibleOrder } from "./order.ts";
import type { Problem } from "./types.ts";

describe("collections", () => {
  it("coerces a named group", () => {
    const item = coerceCollection({ id: "c1", name: "3月月考卷", kind: "exam", createdAt: 1, updatedAt: 2 });
    assert.equal(item?.name, "3月月考卷");
    assert.equal(item?.kind, "exam");
    assert.equal(item?.groupName, "");
    assert.equal(item?.sortOrder, 0);
  });

  it("keeps a free-text folder", () => {
    const item = coerceCollection({
      id: "c2",
      name: "必修一",
      kind: "unit",
      groupName: "人教A版",
      createdAt: 1,
      updatedAt: 2,
    });
    assert.equal(item?.groupName, "人教A版");
  });

  it("drops old enum buckets", () => {
    const item = coerceCollection({
      id: "c3",
      name: "春季班",
      kind: "exam",
      bucket: "institution",
      createdAt: 1,
      updatedAt: 2,
    });
    assert.equal(item?.groupName, "");
  });

  it("merges groups by updatedAt", () => {
    const merged = mergeCollections(
      [{ id: "c1", name: "新", kind: "unit", groupName: "学而思", sortOrder: 2, createdAt: 1, updatedAt: 5 }],
      [{ id: "c1", name: "旧", kind: "exam", groupName: "", sortOrder: 1, createdAt: 1, updatedAt: 2 }],
    );
    assert.equal(merged[0]?.name, "新");
    assert.equal(merged[0]?.kind, "unit");
    assert.equal(merged[0]?.groupName, "学而思");
    assert.equal(merged[0]?.sortOrder, 2);
  });

  it("keeps explicit collection order and puts new unranked groups first", () => {
    const sorted = sortCollectionsByOrder(
      [
        { id: "second", sortOrder: 2, recent: 20 },
        { id: "new", sortOrder: 0, recent: 30 },
        { id: "first", sortOrder: 1, recent: 10 },
      ],
      (item) => item.recent,
    );
    assert.deepEqual(sorted.map((item) => item.id), ["new", "first", "second"]);
  });

  it("builds a default capture group name", () => {
    const name = defaultCollectionName(new Date(2026, 7, 26).getTime());
    assert.equal(name, "8月26日拍题");
  });
});

function stub(partial: Partial<Problem> & Pick<Problem, "id">): Problem {
  return {
    createdAt: 0,
    updatedAt: 0,
    sourceKind: "photo",
    title: partial.id,
    stem: "",
    figures: [],
    subject: "other",
    tags: [],
    difficulty: 2,
    myAnswer: "",
    correctAnswer: "",
    analysis: "",
    notes: "",
    errorReason: "unknown",
    mastery: "new",
    reviewCount: 0,
    nextReviewAt: 0,
    ...partial,
  };
}

describe("source order", () => {
  it("keeps scan order inside a batch", () => {
    const sorted = sortBySourceOrder([
      stub({ id: "c", sourceBatchId: "b1", sourceOrder: 3, createdAt: 3 }),
      stub({ id: "a", sourceBatchId: "b1", sourceOrder: 1, createdAt: 1 }),
      stub({ id: "b", sourceBatchId: "b1", sourceOrder: 2, createdAt: 2 }),
    ]);
    assert.deepEqual(
      sorted.map((p) => p.id),
      ["a", "b", "c"],
    );
  });

  it("keeps earlier batches before later ones", () => {
    const sorted = sortBySourceOrder([
      stub({ id: "n1", sourceBatchId: "new", sourceOrder: 1, createdAt: 20 }),
      stub({ id: "o2", sourceBatchId: "old", sourceOrder: 2, createdAt: 11 }),
      stub({ id: "o1", sourceBatchId: "old", sourceOrder: 1, createdAt: 10 }),
    ]);
    assert.deepEqual(
      sorted.map((p) => p.id),
      ["o1", "o2", "n1"],
    );
  });

  it("moves an id and splices filtered order back", () => {
    assert.deepEqual(moveId(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
    assert.deepEqual(spliceVisibleOrder(["a", "b", "c", "d"], ["b", "c"], ["c", "b"]), ["a", "c", "b", "d"]);
  });
});
