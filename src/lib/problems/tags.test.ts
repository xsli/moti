import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appendTag, applyTagChanges, matchesAllTags, normalizeTag } from "./tags.ts";

describe("problem tags", () => {
  it("normalizes and appends a typed draft", () => {
    assert.equal(normalizeTag("  一元   二次方程  "), "一元 二次方程");
    assert.deepEqual(appendTag(["代数"], " 例题 "), ["代数", "例题"]);
  });

  it("keeps batch additions when a problem already has eight tags", () => {
    const tags = Array.from({ length: 8 }, (_, index) => `标签${index + 1}`);
    assert.deepEqual(applyTagChanges(tags, ["例题"]), ["例题", ...tags.slice(0, 7)]);
  });

  it("removes common tags while preserving unrelated ones", () => {
    assert.deepEqual(applyTagChanges(["代数", "绝对值", "旧标签"], ["例题"], ["旧标签"]), [
      "例题",
      "代数",
      "绝对值",
    ]);
  });

  it("matches every selected filter tag", () => {
    assert.equal(matchesAllTags(["代数", "绝对值", "例题"], ["代数", "例题"]), true);
    assert.equal(matchesAllTags(["代数", "绝对值"], ["代数", "例题"]), false);
    assert.equal(matchesAllTags(["代数"], []), true);
  });
});
