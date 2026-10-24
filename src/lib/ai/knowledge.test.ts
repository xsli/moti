import assert from "node:assert/strict";
import { test } from "node:test";
import { knowledgeScopeKey, knowledgeScopeSchema, parseKnowledgeContent, knowledgeMarkdown } from "./knowledge-schema.ts";
import { knowledgeKind, withKnowledgeSources, representativeSource } from "./knowledge-schema.ts";
import { buildKnowledgePrompt } from "./knowledge-prompt.ts";
import { knowledgeFallback, knowledgePageScope, knowledgePageSearch, knowledgeReturnTo } from "./knowledge-navigation.ts";

const content = {
  title: "整数根", takeaway: "把整数条件转成整除条件。",
  concepts: [{ title: "整除", explanation: "$d\\mid n$", problemIds: ["p1"] }],
  methods: [{ title: "枚举因数", signal: "根是分式", idea: "分母整除分子", steps: ["先排除分母为零"], example: "$x=6/d$", pitfalls: "负因数也要考虑", problemIds: ["p1"] }],
  checklist: ["代回原式"], selfChecks: [{ question: "判别式为平方就够了吗？", answer: "还须验证根的整除条件。" }],
  coverage: [{ problemId: "p1", takeaway: "先判断二次项是否为零" }], uncertainties: [],
};

test("knowledge scope rejects empty and oversized requests; selection identity is order independent", () => {
  assert.equal(knowledgeScopeSchema.safeParse({ problemIds: [] }).success, false);
  assert.equal(knowledgeScopeSchema.safeParse({ problemIds: Array.from({ length: 41 }, (_, i) => `p${i}`) }).success, false);
  assert.equal(knowledgeScopeKey({ problemIds: ["b", "a", "a"] }), knowledgeScopeKey({ problemIds: ["a", "b"] }));
  assert.notEqual(knowledgeScopeKey({ collectionId: "a" }), knowledgeScopeKey({ problemIds: ["a"] }));
});

test("knowledge cannot silently omit a question, duplicate coverage or cite an invented source", () => {
  assert.deepEqual(parseKnowledgeContent(content, ["p1"]), content);
  assert.throws(() => parseKnowledgeContent(content, ["p1", "p2"]), /覆盖/);
  assert.throws(() => parseKnowledgeContent({ ...content, coverage: [...content.coverage, ...content.coverage] }, ["p1", "p2"]), /覆盖/);
  assert.throws(() => parseKnowledgeContent({ ...content, methods: [{ ...content.methods[0], problemIds: ["made-up"] }] }, ["p1"]), /范围外/);
  assert.throws(() => parseKnowledgeContent({ ...content, coverage: [{ problemId: "made-up", takeaway: "错误引用" }] }, ["p1"]), /覆盖/);
});

test("export retains formulas, source links, self-check answers and uncertainty notes", () => {
  const markdown = knowledgeMarkdown({ content: { ...content, uncertainties: ["题干有歧义"] }, sources: [{ id: "p1", title: "例1" }], fingerprint: "abc", generatedAt: 1000 });
  assert.ok(markdown.includes("$d\\mid n$"));
  assert.ok(markdown.includes("[例1](http://127.0.0.1:8080/p/p1)"));
  assert.ok(markdown.includes(content.selfChecks[0].answer));
  assert.ok(markdown.includes("题干有歧义"));
});

test("repairs JSON-decoded LaTeX control escapes inside formulas without changing prose", () => {
  const result = parseKnowledgeContent({ ...content, takeaway: "保留文字\t分隔；$uv-\tau u$；$\frac12$；$\begin{cases}x=1\\end{cases}$" }, ["p1"]);
  assert.equal(result.takeaway, "保留文字\t分隔；$uv-\\tau u$；$\\frac12$；$\\begin{cases}x=1\\end{cases}$");
});

test("single, lecture and arbitrary selection have distinct direction and storage identity", () => {
  const single = { problemIds: ["p1", "p1"] };
  const lecture = { collectionId: "p1" };
  const selection = { problemIds: ["p1", "p2"] };
  assert.equal(knowledgeKind(single), "single");
  assert.equal(knowledgeKind(lecture), "lecture");
  assert.equal(knowledgeKind(selection), "selection");
  assert.equal(new Set([single, lecture, selection].map(knowledgeScopeKey)).size, 3);
  const a = buildKnowledgePrompt(single, "例1"), b = buildKnowledgePrompt(lecture, "第5讲");
  assert.match(a, /单题模式：突破口与思路复盘/);
  assert.match(a, /改变一个条件的变式/);
  assert.doesNotMatch(a, /整讲模式/);
  assert.match(b, /整讲模式：题型体系与方法选择/);
  assert.match(b, /带分支的选法路线/);
  assert.match(buildKnowledgePrompt(selection, "两题"), /不声称覆盖整讲/);
  const base = { content, sources: [{id:"p1", title:"例1", stem:"原题内容"}], fingerprint:"abc", generatedAt:0 };
  const md = knowledgeMarkdown({ ...base, kind: "single" });
  assert.match(md, /## 原题\n\n原题内容/);
  assert.match(md, /## 突破口与推理链/);
  assert.doesNotMatch(md, /整讲方法体系/);
  assert.match(knowledgeMarkdown({...base, kind:"lecture"}), /## 方法选择路线/);
});

test("model formatting artifacts are removed and math Greek stays exportable", () => {
  const result = parseKnowledgeContent({ ...content, takeaway: "正文α；$\u001b[1mα\u001b[0mx+β=0$" }, ["p1"]);
  assert.equal(result.takeaway, "正文α；$\\alpha x+\\beta =0$");
});

test("full original snapshots never mix changed source versions; representative follows the worked example", () => {
  const report = { content, sources: [{id:"p1", title:"旧题名"}], fingerprint:"old", generatedAt:123 };
  const sources = [{id:"p1", title:"新题名", label:"例题 3", stem:"完整题干 A.选项 (1)小问"}, {id:"p2",title:"第二题",label:"习题 3",stem:"另一个原题"}];
  assert.equal(withKnowledgeSources(report,{fingerprint:"changed",sources}),report);
  const hydrated = withKnowledgeSources(report,{fingerprint:"old",sources});
  assert.equal(hydrated.generatedAt,123);
  assert.equal(hydrated.content,report.content);
  assert.equal(hydrated.sources[0].stem,sources[0].stem);
  const method={...content.methods[0],problemIds:["p1","p2"],example:"习题3中先消参。例3是另一种情况。"};
  assert.equal(representativeSource(hydrated,method)?.id,"p2");
  assert.equal(representativeSource(hydrated,{...method,example:"例30不是例3"})?.id,"p1");
  assert.match(knowledgeMarkdown(hydrated), /完整原题附录/);
  assert.match(knowledgeMarkdown(hydrated), /完整题干 A.选项 \(1\)小问/);
});

test("knowledge reading URLs preserve scopes and return destinations without accepting ambiguous or external navigation", () => {
  for (const scope of [{collectionId:"lesson6"}, {problemIds:["p1"]}, {problemIds:["p1","p2"]}]) {
    const search=knowledgePageSearch({...scope,returnTo:"/?g=lesson6"});
    assert.deepEqual(knowledgePageScope(search),scope);
    assert.equal(search.returnTo,"/?g=lesson6");
  }
  assert.equal(knowledgePageScope(knowledgePageSearch({collectionId:"lesson6",problemIds:["p1"]})),null);
  assert.equal(knowledgePageScope(knowledgePageSearch({problemIds:"p1"})),null);
  assert.equal(knowledgePageScope(knowledgePageSearch({problemIds:Array.from({length:41},(_,i)=>`p${i}`)})),null);
  assert.equal(knowledgePageScope(knowledgePageSearch({})),null);
  for (const url of ["https://example.com", "//example.com", "/\\example.com", "/knowledge", "javascript:alert(1)"]) assert.equal(knowledgeReturnTo(url),undefined);
  assert.equal(knowledgeReturnTo("/p/p1?browse=group-1"),"/p/p1?browse=group-1");
  assert.equal(knowledgeFallback({collectionId:"lesson6"}),"/?g=lesson6");
  assert.equal(knowledgeFallback({problemIds:["p1"]}),"/p/p1");
  assert.equal(knowledgeFallback({problemIds:["p1","p2"]}),"/");
});
