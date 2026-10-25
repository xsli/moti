import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVariants, variantRequestSchema, variantToProblem } from "./variants-schema.ts";

const candidate = {
  title: "方程变式", stem: "求 $2x+3=9$ 的解。", correctAnswer: "$x=3$",
  analysis: "移项得 $2x=6$，所以 $x=3$。", difficulty: 2, change: "保留移项方法，调整系数。",
  review: { passed: true, comment: "代入满足原方程。" },
};

test("variant request validates settings and limits", () => {
  const input = { sourceId: "source", mode: "method", level: "similar", method: "middle", count: 3, extra: "" };
  assert.equal(variantRequestSchema.safeParse(input).success, true);
  for (const count of [0, 6, 1.5]) assert.equal(variantRequestSchema.safeParse({ ...input, count }).success, false);
  assert.equal(variantRequestSchema.safeParse({ ...input, mode: "unknown" }).success, false);
});

test("rejects incomplete, duplicate, copied and wrong-count variants", () => {
  assert.equal(parseVariants({ candidates: [candidate] }, 1, "original").length, 1);
  assert.throws(() => parseVariants({ candidates: [candidate] }, 2, "original"));
  assert.throws(() => parseVariants({ candidates: [candidate, { ...candidate, stem: ` ${candidate.stem} ` }] }, 2, "original"));
  assert.throws(() => parseVariants({ candidates: [candidate] }, 1, candidate.stem));
  assert.throws(() => parseVariants({ candidates: [{ ...candidate, analysis: " " }] }, 1, "original"));
});

test("saved variants preserve provenance but never inherit media or mastery", () => {
  const source = { id: "original", title: "原题", subject: "algebra" as const, tags: ["例题", "习题", "方程", "AI变式"], sourceImage: "image", figures: [{}], mastery: "mastered" };
  const result = variantToProblem(candidate, source, { id: "new", collectionId: "group", batchId: "batch", order: 1, now: 100 });
  assert.equal(result.id, "new");
  assert.equal(result.collectionId, "group");
  assert.equal(result.sourceImage, undefined);
  assert.deepEqual(result.figures, []);
  assert.equal(result.mastery, "unpracticed");
  assert.deepEqual(result.practiceHistory, { version: 1, priorUnknown: false, entries: [] });
  assert.equal(result.reviewCount, 0);
  assert.deepEqual(result.tags, ["AI变式", "方程"]);
  assert.match(result.notes, /\/p\/original/);
  assert.match(result.notes, /待人工核验/);
  assert.equal(result.sourceBatchId, "batch");
});
