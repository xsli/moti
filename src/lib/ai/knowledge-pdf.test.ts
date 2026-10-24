import assert from "node:assert/strict";
import { test } from "node:test";
import { buildKnowledgeLatex, noteTextToTex, knowledgeFigureAssets } from "./knowledge-pdf-template.ts";

test("note formulas preserve modular arithmetic; prose and malicious TeX cannot execute", () => {
  assert.match(noteTextToTex(String.raw`$r^2\equiv1\pmod{34}$`), /\\NoteInline\{r\^2\\equiv1\\pmod\{34\}\}/);
  assert.match(noteTextToTex(String.raw`$$\frac{1}{2}$$`), /\\NoteDisplay/);
  assert.equal(noteTextToTex(String.raw`100% & \input{secret}`), String.raw`100\% \& \textbackslash{}input\{secret\}`);
  for (const command of [String.raw`\input{secret}`, String.raw`\write18{cmd}`, String.raw`\href{https://bad}{x}`, String.raw`\def\x{y}`, String.raw`\end{document}`]) {
    assert.throws(() => noteTextToTex(`$${command}$`), /非数学/);
  }
});

test("note PDF retains every content section, separates answers, and labels outdated exports", () => {
  const report = {
    generatedAt: 0, fingerprint: "test", sources: [{ id: "p1", title: "原题一" }],
    content: { title: "主题", takeaway: "主线", uncertainties: ["歧义提示"],
      concepts: [{ title: "知识名", explanation: "适用条件", problemIds: ["p1"] }],
      methods: [{ title: "方法名", signal: "信号", idea: "理由", steps: ["步骤"], example: "示范", pitfalls: "易错点", problemIds: ["p1"] }],
      checklist: ["检查条件"], selfChecks: [{ question: "自测问题", answer: "自测解答" }], coverage: [{ problemId: "p1", takeaway: "逐题收获" }],
    },
  };
  const tex = buildKnowledgeLatex(report, true);
  for (const word of ["主线", "歧义提示", "适用条件", "信号", "理由", "步骤", "示范", "易错点", "检查条件", "自测问题", "自测解答", "逐题收获"]) assert.ok(tex.includes(word));
  assert.ok(tex.indexOf("自测问题") < tex.indexOf("04 / ANSWER KEY"));
  assert.ok(tex.indexOf("自测解答") > tex.indexOf("04 / ANSWER KEY"));
  assert.match(tex, /原题或题目范围已变化/);
  assert.match(tex, /\\hyperlink\{source0\}/);
  assert.match(tex, /\\hypertarget\{source0\}/);
  assert.match(tex, /127\.0\.0\.1:8080\/p\/p1/);
  const single = buildKnowledgeLatex({ ...report, kind: "single", sources: [{id:"p1",title:"原题一",stem:"原题快照"}] });
  assert.match(single, /单题思路复盘/);
  assert.match(single, /原题快照/);
  assert.match(single, /突破口：为什么想到这一步/);
  assert.match(single, /变式与迁移自测/);
  assert.doesNotMatch(single, /方法索引|逐题收获 · 续|STUDY MAP/);
  for (const word of ["主线", "歧义提示", "适用条件", "信号", "理由", "步骤", "示范", "易错点", "检查条件", "自测问题", "自测解答", "逐题收获"]) assert.ok(single.includes(word));
  assert.ok(tex.indexOf("ROUTE / 方法选择") < tex.indexOf("01 / FOUNDATIONS"));
  const complete = {...report, sources:[{id:"p1", title:"原题一", label:"例题 1", stem:"题干完整保留，选项A、小问(1)。"}]};
  const full = buildKnowledgeLatex(complete);
  assert.equal(full.split("题干完整保留，选项A、小问(1)。").length - 1, 2);
  assert.match(full, /完整原题与方法索引/);
  assert.match(full, /\\label\{method0\}/);
  assert.match(full, /\\label\{source0\}/);
  assert.match(full, /\\hyperlink\{method0\}/);
  assert.match(full, /\\pageref\*\{source0\}/);
  const illustrated = {...complete, sources:[{...complete.sources[0],stem:"前文 ![示意图](figure:f1) 后文", figures:[{id:"f1",title:"图",svg:"",caption:"",inline:true,image:"data:image/png;base64,AAAA",subproblem:1}]}]};
  const assets=knowledgeFigureAssets(illustrated);
  assert.equal(assets[0].path,"source-0-figure-0.png");
  const illustratedTex=buildKnowledgeLatex(illustrated);
  assert.match(illustratedTex,/includegraphics.*source-0-figure-0.png/);
  assert.doesNotMatch(illustratedTex,/figure:f1/);
  assert.throws(()=>knowledgeFigureAssets({...complete,sources:[{...illustrated.sources[0],figures:[{...illustrated.sources[0].figures[0],image:"https://example.com/hidden.png"}]}]}),/配图/);
});
