import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { samePaperExport, type PaperExportInput } from "./export-state.ts";
import type { Problem } from "../problems/types.ts";

function input(patch: Partial<Problem> = {}, options: Partial<PaperExportInput> = {}): PaperExportInput {
  const problem: Problem = {
    id: "p1", title: "Question", stem: "$x=1$", figures: [], tags: [], difficulty: 2,
    subject: "algebra", sourceKind: "text", createdAt: 1, updatedAt: 1, mastery: "new",
    myAnswer: "", correctAnswer: "$2$", analysis: "Substitute", notes: "", errorReason: "unknown",
    reviewCount: 0, nextReviewAt: 0, ...patch,
  };
  return {
    title: "Paper", dateLabel: "2026-10-02", sheetKind: "exam", withAnswers: false,
    blankLines: 5, blankAuto: false,
    items: [{ kind: "problem", problem, number: 1, label: "1.", role: "practice", blankLines: 5 }],
    ...options,
  };
}

describe("generated PDF validity", () => {
  it("survives fresh objects from cache and unrelated metadata changes", () => {
    assert.equal(samePaperExport(input(), input()), true);
    const refreshed = input({ mastery: "mastered", updatedAt: 9, tags: ["new"], difficulty: 5, title: "Renamed", notes: "Note" });
    if (refreshed.items[0].kind === "problem") {
      Object.defineProperty(refreshed.items[0].problem, "sourceImage", { get() { throw new Error("Original image must not be read"); } });
    }
    assert.equal(samePaperExport(input(), refreshed), true);
    assert.equal(samePaperExport(null, refreshed), false);
  });

  it("invalidates real settings and printed stem changes", () => {
    for (const patch of [
      { title: "Changed" }, { dateLabel: "2026-10-03" }, { withAnswers: true },
      { blankLines: 2 as const }, { blankAuto: true }, { sheetKind: "handout" as const },
    ]) assert.equal(samePaperExport(input(), input({}, patch)), false);
    assert.equal(samePaperExport(input(), input({ stem: "$x=3$" })), false);
    assert.equal(samePaperExport(input(), input({ id: "p2" })), false);
  });

  it("checks answers when printed or used to size writing space", () => {
    assert.equal(samePaperExport(input(), input({ analysis: "Changed" })), true);
    for (const mode of [{ withAnswers: true }, { blankAuto: true }]) {
      assert.equal(samePaperExport(input({}, mode), input({ analysis: "Changed" }, mode)), false);
      assert.equal(samePaperExport(input({}, mode), input({ correctAnswer: "$3$" }, mode)), false);
    }
  });

  it("invalidates the handout group title and inferred example section", () => {
    const mode = { sheetKind: "handout" as const, groupName: "Group" };
    assert.equal(samePaperExport(input({}, mode), input({}, { ...mode, groupName: "Changed" })), false);
    assert.equal(samePaperExport(input({}, mode), input({ tags: ["例题"] }, mode)), false);
    assert.equal(samePaperExport(input({}, mode), input({ tags: ["代数"] }, mode)), true);
  });

  it("checks displayed figures but ignores retained originals", () => {
    const figure = { id: "f", title: "Figure", caption: "", svg: "", image: "data:image/png;base64,AAAA" };
    assert.equal(samePaperExport(input({ figures: [figure] }), input({ figures: [{ ...figure, originalImage: "data:image/png;base64,BBBB" }] })), true);
    for (const patch of [{ image: "data:image/png;base64,CCCC" }, { subproblem: 1 }]) {
      assert.equal(samePaperExport(input({ figures: [figure] }), input({ figures: [{ ...figure, ...patch }] })), false);
    }
    assert.equal(samePaperExport(input(), input({ figures: [figure] })), false);
    assert.equal(samePaperExport(input({ figures: [{ ...figure, image: undefined, svg: "a" }] }), input({ figures: [{ ...figure, image: undefined, svg: "b" }] })), false);
  });

  it("checks headings, ordering, labels, roles and per-question spacing", () => {
    const base = input();
    for (const patch of [{ number: 2 }, { label: "Example 1" }, { role: "example" as const }, { blankLines: 2 as const }]) {
      const next = input();
      Object.assign(next.items[0], patch);
      assert.equal(samePaperExport(base, next), false);
    }
    const heading = { kind: "heading" as const, role: "practice" as const, title: "Exercises" };
    assert.equal(samePaperExport(input({}, { items: [heading] }), input({}, { items: [{ ...heading }] })), true);
    assert.equal(samePaperExport(input({}, { items: [heading] }), input({}, { items: [{ ...heading, title: "Changed" }] })), false);
    assert.equal(samePaperExport(input({}, { items: [heading, ...base.items] }), input({}, { items: [...base.items, heading] })), false);
    assert.equal(samePaperExport(base, input({}, { items: [] })), false);
  });

  it("includes notes or title used by handout knowledge sections", () => {
    function points(patch: Partial<Problem> = {}) {
      const result = input(patch, { sheetKind: "handout", withAnswers: true });
      result.items[0].role = "points";
      return result;
    }
    assert.equal(samePaperExport(points(), points({ title: "Changed" })), false);
    assert.equal(samePaperExport(points({ notes: "Text" }), points({ notes: "Text", title: "Ignored" })), true);
    assert.equal(samePaperExport(points({ notes: "Text" }), points({ notes: "Changed" })), false);
    assert.equal(samePaperExport(points(), points({ analysis: "Changed" })), false);
  });
});
