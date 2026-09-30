import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookChapters, bookChapterItems, bookContents, selectBookChapters } from "./book.ts";
import type { Collection } from "../problems/collections.ts";
import type { Problem } from "../problems/types.ts";
import { safeBookCut, bookFragmentEnd, bookContinuationStart } from "./book-pagination.ts";

describe("book page boundaries", () => {
  it("discards excess writing space instead of creating a blank continuation page", () => {
    assert.deepEqual(bookFragmentEnd(0, 200, 400, 150, [{ top: 10, bottom: 148 }]), {
      end: 200,
      complete: true,
    });
  });
  it("continues long question text without a leading gap", () => {
    const ink = [
      { top: 10, bottom: 140 },
      { top: 180, bottom: 210 },
      { top: 240, bottom: 260 },
    ];
    assert.deepEqual(bookFragmentEnd(0, 200, 400, 262, ink), { end: 180, complete: false });
    assert.equal(bookContinuationStart(150, ink), 178);
    assert.equal(bookContinuationStart(180, ink), 180);
  });
  it("cuts whitespace without changing the requested height", () => {
    assert.equal(safeBookCut(0, 80, [{ top: 10, bottom: 30 }]), 80);
  });
  it("moves a whole formula or figure to the next page", () => {
    assert.equal(safeBookCut(0, 80, [{ top: 60, bottom: 110 }]), 60);
  });
  it("keeps overlapping text and fractions on the same side of the boundary", () => {
    assert.equal(
      safeBookCut(0, 80, [
        { top: 65, bottom: 95 },
        { top: 55, bottom: 70 },
      ]),
      55,
    );
  });
  it("reports a zero-size cut for a single oversized object", () => {
    assert.equal(safeBookCut(100, 180, [{ top: 90, bottom: 250 }]), 100);
  });
});

const collection = (id: string, sortOrder = 1, groupName = "书"): Collection => ({
  id,
  name: id,
  kind: "unit",
  groupName,
  sortOrder,
  createdAt: 1,
  updatedAt: 1,
});
const problem = (id: string, collectionId: string, sourceOrder = 1, tags: string[] = []): Problem =>
  ({
    id,
    collectionId,
    sourceOrder,
    sourceBatchId: collectionId,
    createdAt: 1,
    tags,
  }) as Problem;

describe("book export", () => {
  it("includes only nonempty chapters in the folder and respects chapter and source order", () => {
    const cs = [
      collection("b", 2),
      collection("other", 1, "其他书"),
      collection("a", 1),
      collection("empty", 3),
    ];
    const ps = [
      problem("b1", "b"),
      problem("a2", "a", 2),
      problem("other1", "other"),
      problem("a1", "a", 1),
    ];
    assert.deepEqual(
      bookChapters("书", cs, ps).map((c) => [c.id, c.problemIds]),
      [
        ["a", ["a1", "a2"]],
        ["b", ["b1"]],
      ],
    );
    assert.equal(cs[0].id, "b");
  });
  it("matches the home page kind grouping, not global sortOrder", () => {
    const cs = [collection("unit", 1), { ...collection("exam", 5), kind: "exam" as const }];
    assert.deepEqual(
      bookChapters(
        "书",
        cs,
        cs.map((c) => problem(c.id, c.id)),
      ).map((c) => c.id),
      ["exam", "unit"],
    );
  });
  it("selects and combines chapters in the requested order without touching the original", () => {
    const cs = [
      { id: "a", title: "A", problemIds: ["a1"] },
      { id: "b", title: "B", problemIds: ["b1"] },
    ];
    assert.deepEqual(
      selectBookChapters(cs, ["b", "a"]).map((c) => c.id),
      ["b", "a"],
    );
    assert.deepEqual(
      selectBookChapters(cs, ["b"]).map((c) => c.id),
      ["b"],
    );
    assert.throws(() => selectBookChapters(cs, []));
    assert.throws(() => selectBookChapters(cs, ["a", "a"]));
    assert.throws(() => selectBookChapters(cs, ["missing"]));
  });
  it("preserves interleaved source order and restarts example/exercise numbering per chapter", () => {
    const ps = [
      problem("a", "x", 1, ["例题"]),
      problem("b", "x", 2, ["习题"]),
      problem("c", "x", 3, ["例题"]),
    ];
    const items = bookChapterItems(ps, 2);
    assert.deepEqual(
      items.map((i) => i.kind === "problem" && [i.problem.id, i.label]),
      [
        ["a", "例1."],
        ["b", "1."],
        ["c", "例2."],
      ],
    );
    const first = bookChapterItems(ps.slice(2), 2)[0];
    assert.equal(first.kind === "problem" && first.label, "例1.");
  });
  it("counts the cover and multiple contents pages in chapter destinations", () => {
    const cs = Array.from({ length: 23 }, (_, i) => ({
      id: String(i),
      title: String(i),
      problemIds: ["p"],
    }));
    const toc = bookContents(
      cs,
      cs.map(() => 2),
    );
    assert.equal(toc[0].page, 4);
    assert.equal(toc[22].page, 48);
    assert.throws(() => bookContents(cs, [2]));
    assert.throws(() => bookContents(cs.slice(0, 1), [0]));
  });
});
