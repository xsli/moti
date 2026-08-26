import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addToBasket,
  applyLayoutToIds,
  applyTemplateRows,
  clearBasket,
  deleteTemplate,
  emptySession,
  idsFromRows,
  parseSession,
  removeFromBasket,
  saveTemplate,
} from "./session.ts";

describe("paper session", () => {
  it("adds unique ids and keeps order", () => {
    let session = emptySession();
    session = addToBasket(session, ["b", "a", "b", "c"]);
    assert.deepEqual(session.basket, ["b", "a", "c"]);
    session = addToBasket(session, ["a", "d"]);
    assert.deepEqual(session.basket, ["b", "a", "c", "d"]);
  });

  it("removes and clears basket", () => {
    let session = addToBasket(emptySession(), ["1", "2", "3"]);
    session = removeFromBasket(session, "2");
    assert.deepEqual(session.basket, ["1", "3"]);
    session = clearBasket(session);
    assert.deepEqual(session.basket, []);
  });

  it("saves a paper template with headings and scores", () => {
    const session = saveTemplate(emptySession(), {
      name: "周六数学卷",
      title: "错题练习卷",
      withAnswers: true,
      rows: [
        { kind: "heading", id: "h1", title: "填空题", perScore: 4 },
        { kind: "problem", id: "p1", problemId: "prob-1" },
        { kind: "heading", id: "h2", title: "解答题", perScore: 10 },
        { kind: "problem", id: "p2", problemId: "prob-2" },
      ],
    });
    assert.equal(session.templates.length, 1);
    const tpl = session.templates[0];
    assert.equal(tpl?.name, "周六数学卷");
    assert.equal(tpl?.withAnswers, true);
    assert.deepEqual(idsFromRows(tpl?.rows ?? []), ["prob-1", "prob-2"]);
    assert.equal(tpl?.rows[0]?.kind === "heading" && tpl.rows[0].perScore, 4);
  });

  it("drops missing problems when applying a template", () => {
    const session = saveTemplate(emptySession(), {
      name: "几何",
      title: "几何卷",
      withAnswers: false,
      rows: [
        { kind: "heading", id: "h1", title: "填空题", perScore: 4 },
        { kind: "problem", id: "p1", problemId: "keep" },
        { kind: "problem", id: "p2", problemId: "gone" },
      ],
    });
    const live = applyTemplateRows(session.templates[0]?.rows ?? [], new Set(["keep"]));
    assert.equal(live.length, 2);
    assert.equal(live[0]?.kind, "heading");
    assert.equal(live[1]?.kind === "problem" && live[1].problemId, "keep");
  });

  it("parses persisted json and can delete templates", () => {
    const saved = saveTemplate(emptySession(), {
      name: "A",
      title: "A卷",
      withAnswers: false,
      rows: [{ kind: "problem", id: "x", problemId: "p" }],
    });
    const parsed = parseSession(JSON.parse(JSON.stringify(saved)));
    assert.equal(parsed.templates[0]?.name, "A");
    const gone = deleteTemplate(parsed, parsed.templates[0]?.id ?? "");
    assert.equal(gone.templates.length, 0);
  });

  it("applies heading layout onto a new problem list", () => {
    const layout = applyLayoutToIds(
      [
        { kind: "heading", id: "h1", title: "填空题", perScore: 4 },
        { kind: "problem", id: "p1", problemId: "old-a" },
        { kind: "problem", id: "p2", problemId: "old-b" },
        { kind: "heading", id: "h2", title: "解答题", perScore: 10 },
        { kind: "problem", id: "p3", problemId: "old-c" },
      ],
      ["n1", "n2", "n3", "n4"],
    );
    const kinds = layout.map((row) => (row.kind === "heading" ? row.title : row.problemId));
    assert.deepEqual(kinds, ["填空题", "n1", "n2", "解答题", "n3", "n4"]);
    assert.equal(layout[0]?.kind === "heading" && layout[0].perScore, 4);
    assert.equal(layout[3]?.kind === "heading" && layout[3].perScore, 10);
  });
});
