import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitStemSections, stemSubproblemNumbers } from "./subproblems.ts";

describe("subproblem figures", () => {
  it("splits numbered subproblems and keeps their labels", () => {
    const stem = "说明文字\n（1）第一问 $|a|$\n（2）第二问 $|b|$";
    const sections = splitStemSections(stem);
    assert.deepEqual(sections.map((section) => section.subproblem), [0, 1, 2]);
    assert.match(sections[1]?.text ?? "", /^（1）/);
    assert.match(sections[2]?.text ?? "", /^（2）/);
  });

  it("lists each available anchor once", () => {
    assert.deepEqual(stemSubproblemNumbers("(1) A\n(2) B\n(2) C"), [1, 2]);
  });

  it("keeps an unnumbered stem as one whole section", () => {
    assert.deepEqual(splitStemSections("求 $x$ 的值"), [{ subproblem: 0, text: "求 $x$ 的值" }]);
  });
});
