import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitStemSections, stemSubproblemNumbers, stemSectionsWithFigures } from "./subproblems.ts";

describe("subproblem figures", () => {
  it("attaches reading figures once and retains unanchored or unmatched figures", () => {
    const figures = [
      { id: "one", title: "", caption: "", svg: "", subproblem: 1 },
      { id: "two", title: "", caption: "", svg: "", subproblem: 2 },
      { id: "whole", title: "", caption: "", svg: "" },
      { id: "missing", title: "", caption: "", svg: "", subproblem: 9 },
    ];
    const result = stemSectionsWithFigures("说明 (1) 第一问 (2) 根据问题 (1) 的结论", figures);
    assert.deepEqual(result.sections.map((s) => s.figures.map((f) => f.id)), [[], ["one"], ["two"], []]);
    assert.deepEqual(result.trailingFigures.map((f) => f.id), ["whole", "missing"]);
    assert.equal(figures.length, 4);
  });

  it("splits numbered subproblems and keeps their labels", () => {
    const stem = "说明文字\n（1）第一问 $|a|$\n（2）第二问 $|b|$";
    const sections = splitStemSections(stem);
    assert.deepEqual(
      sections.map((section) => section.subproblem),
      [0, 1, 2],
    );
    assert.match(sections[1]?.text ?? "", /^（1）/);
    assert.match(sections[2]?.text ?? "", /^（2）/);
  });

  it("lists each available anchor once", () => {
    assert.deepEqual(stemSubproblemNumbers("(1) A\n(2) B\n(2) C"), [1, 2]);
  });

  it("keeps an unnumbered stem as one whole section", () => {
    assert.deepEqual(splitStemSections("求 $x$ 的值"), [{ subproblem: 0, text: "求 $x$ 的值" }]);
  });

  it("does not treat function arguments inside math as subproblem labels", () => {
    const stem = "(2) 定义 $f(x)=x^2$，求 $f(1)+f(3)+f(5)+\\cdots+f(999)$ 的值。";
    const sections = splitStemSections(stem);
    assert.deepEqual(sections, [{ subproblem: 2, text: stem }]);
    assert.deepEqual(stemSubproblemNumbers(stem), [2]);
  });
});
