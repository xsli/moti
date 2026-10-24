import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGaokaoLatex, splitGaokaoChoices, escapeLatexText } from "./gaokao-latex.ts";
import type { ExamItem } from "./layout.ts";
import type { Problem } from "../problems/types.ts";
import { assertMathTexSafe } from "./math-tex-safety.ts";
import { gaokaoPdfSchema } from "./gaokao-pdf-schema.ts";
import { readPdfCache, writePdfCache } from "./pdf-cache.ts";
import { mkdtemp, rm, writeFile, utimes, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

function item(patch: Partial<Problem> = {}): ExamItem {
  return { kind: "problem", number: 1, label: "1.", role: "practice", blankLines: 5, problem: {
    id: "p", title: "测试题", stem: "求 $x^2$。", figures: [], tags: ["解答题"], difficulty: 2,
    subject: "algebra", sourceKind: "text", createdAt: 1, updatedAt: 1, mastery: "new",
    myAnswer: "", correctAnswer: "$42$", analysis: "秘密解析", notes: "", errorReason: "unknown",
    reviewCount: 0, nextReviewAt: 0, ...patch,
  } };
}
const options = { title: "高考 & 50%_模拟", withAnswers: false };

test("persistent PDF cache survives new readers and rejects expired/corrupt entries", async t => {
  const dir = await mkdtemp(path.join(tmpdir(), "moti-cache-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const key = "a".repeat(64), value = { base64: Buffer.from("%PDF-1.7\nfixture").toString("base64"), warnings: ["check"] };
  assert.equal(await readPdfCache(dir, key), null);
  await writePdfCache(dir, key, value);
  assert.deepEqual(await readPdfCache(dir, key), value);
  const file = path.join(dir, `${key}.json`), old = new Date(Date.now() - 8 * 86400000);
  await utimes(file, old, old);
  assert.equal(await readPdfCache(dir, key), null);
  await writeFile(file, JSON.stringify({ ...value, digest: "tampered" }));
  assert.equal(await readPdfCache(dir, key), null);
  await writeFile(file, "broken-json");
  assert.equal(await readPdfCache(dir, key), null);
  await writePdfCache(dir, "../outside", value);
  assert.equal(await readPdfCache(dir, "../outside"), null);
});

test("PDF cache bounds its own entries without pruning unrelated files", async t => {
  const dir = await mkdtemp(path.join(tmpdir(), "moti-cache-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, "keep.txt"), "keep");
  for (let i = 0; i < 23; i++) await writePdfCache(dir, i.toString(16).padStart(64, "0"), {
    base64: Buffer.from("%PDF-1.7\nfixture").toString("base64"), warnings: [],
  });
  const files = await readdir(dir);
  assert.equal(files.filter(f => f.endsWith(".json")).length, 20);
  assert.ok(files.includes("keep.txt"));
  assert.equal(files.filter(f => f.endsWith(".tmp")).length, 0);
});

test("server math allowlist rejects file access, macro expansion and group escapes", () => {
  for (const math of [String.raw`\input{private}`, String.raw`\csname input\endcsname`,
    String.raw`\def\x{1}`, String.raw`\write18{cmd}`, String.raw`\special{file}`, String.raw`\end{document}`,
    "}bad{", "x%comment", "^^5cinput{file}", String.raw`\begin{array}{c}x\end{matrix}`]) {
    assert.throws(() => assertMathTexSafe(math), /非数学/);
  }
  assert.doesNotThrow(() => assertMathTexSafe(String.raw`\left\{x\mid x>0\right\}\quad \frac{1}{2}+\begin{array}{cc}1&2\\3&4\end{array}`));
});

test("PDF requests restrict image payloads and settings before compilation", () => {
  const request = { options: { title: "Paper", withAnswers: false, minutes: 120, solutionSpaceCm: 5 }, items: [item()] };
  assert.equal(gaokaoPdfSchema.safeParse(request).success, true);
  for (const minutes of [-1, 601, 1.5]) assert.equal(gaokaoPdfSchema.safeParse({ ...request, options: { ...request.options, minutes } }).success, false);
  const bad = item({ figures: [{ id: "f", title: "", caption: "", svg: "", image: "file:///private.png" }] });
  assert.equal(gaokaoPdfSchema.safeParse({ ...request, items: [bad] }).success, false);
  assert.equal(gaokaoPdfSchema.safeParse({ ...request, items: [] }).success, false);
});

test("choices preserve math and recognize only complete A-D labels", () => {
  assert.deepEqual(splitGaokaoChoices("已知 $A.B$\nA. $1$　B. $2$　C. $3$　D. $4$"), {
    stem: "已知 $A.B$", choices: ["$1$", "$2$", "$3$", "$4$"],
  });
  assert.equal(splitGaokaoChoices("题目\nA. one B. two D. four"), null);
  assert.equal(splitGaokaoChoices("题目 $A. B. C. D.$"), null);
});

test("student export excludes answers, analysis and their pictures", () => {
  const f = { id: "solution", inline: true, title: "", caption: "", svg: "", image: "data:image/png;base64,AA==" };
  const result = buildGaokaoLatex([item({ analysis: "秘密解析 ![图](figure:solution)", figures: [f] })], options);
  assert.equal(result.teacher, undefined);
  assert.equal(result.assets.length, 0);
  assert.doesNotMatch(result.student, /秘密解析|\$42\$/);
  assert.match(result.student, /高考 \\& 50\\%\\_模拟/);
  assert.match(result.student, /\\vspace\*\{5cm\}/);
  assert.doesNotMatch(result.student, /满分/);
});

test("teacher export resolves repeated inline images once, without student leakage", () => {
  const f = { id: "s", inline: true, title: "", caption: "", svg: "", image: "data:image/jpeg;base64,AA==" };
  const result = buildGaokaoLatex([item({ analysis: "![图](figure:s)\n![图](figure:s)", figures: [f] })], { ...options, withAnswers: true });
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].path, "images/figure-001.jpg");
  assert.match(result.teacher!, /\\begin\{solution\}/);
  assert.doesNotMatch(result.teacher!, /\\vspace\*/);
  assert.doesNotMatch(result.student, /figure-001/);
});

test("keeps selected order, uses explicit scores, numbers across sections", () => {
  const result = buildGaokaoLatex([
    item({ stem: "第一题", tags: ["填空题"], notes: "分值：5分。" }),
    item({ stem: "第二题", tags: ["解答题"], notes: "分值：12分。" }),
  ], options);
  assert.ok(result.student.indexOf("第一题") < result.student.indexOf("第二题"));
  assert.match(result.student, /满分 17 分/);
  assert.match(result.student, /begin\{problem\}\[index=2,points=12\]/);
  assert.match(result.student, /二、解答题/);
});

test("custom headings win and elective questions do not inflate paper total", () => {
  const result = buildGaokaoLatex([{ kind: "heading", role: "practice", title: "自定义分节" }, item({ tags: ["选考题"], notes: "分值：10分。" })], options);
  assert.match(result.student, /section\*\{自定义分节\}/);
  assert.doesNotMatch(result.student, /一、选考题|满分/);
});

test("missing figures and unsafe formulas fail rather than silently dropping content", () => {
  assert.throws(() => buildGaokaoLatex([item({ stem: "![图](figure:missing)" })], options), /尚未加载/);
  assert.throws(() => buildGaokaoLatex([item({ stem: "$\\input{secrets}$" })], options), /非数学/);
  assert.throws(() => buildGaokaoLatex([], options), /选择题目/);
  assert.throws(() => buildGaokaoLatex([item()], { ...options, minutes: NaN }), /范围/);
});

test("unrecognized choices stay unchanged and are reported", () => {
  const result = buildGaokaoLatex([item({ tags: ["单选题"], stem: "题目\nA. a\nB. b" })], options);
  assert.match(result.student, /A\. a/);
  assert.ok(result.warnings.some(w => w.includes("选项")));
});

test("figures nested in imported math-array tables are exported too", () => {
  const f = { id: "graph", inline: true, title: "", caption: "", svg: "", image: "data:image/png;base64,AA==" };
  const result = buildGaokaoLatex([item({ stem: String.raw`$$\begin{array}{c|c}\text{A}&\text{B}\\\text{![图](figure:graph)}&1\end{array}$$`, figures: [f] })], options);
  assert.equal(result.assets.length, 1);
  assert.doesNotMatch(result.student, /figure:graph/);
  assert.match(result.student, /\\text\{\\includegraphics\[width=0.4/);
});

test("user-assigned section points override the original paper score", () => {
  const question = item({ notes: "分值：12分。" });
  if (question.kind !== "problem") throw new Error("fixture");
  question.points = 8;
  const result = buildGaokaoLatex([{ kind: "heading", title: "解答题（每题8分）", role: "practice" }, question], options);
  assert.match(result.student, /points=8/);
  assert.match(result.student, /满分 8 分/);
  assert.doesNotMatch(result.student, /points=12/);
});

test("Unicode math in prose uses the math font rather than missing text glyphs", () => {
  assert.equal(escapeLatexText("∴△ABC⊥α"), String.raw`\ensuremath{∴}\ensuremath{\triangle}ABC\ensuremath{⊥}\ensuremath{α}`);
});

test("image option tables retain explicit label associations", () => {
  const stem = String.raw`题目$$\begin{array}{c|c}\text{A}&\text{B}\\\hline\text{![图](figure:a)}&\text{![图](figure:b)}\\\text{C.}&\text{D.}\\\text{![图](figure:c)}&\text{![图](figure:d)}\end{array}$$`;
  assert.deepEqual(splitGaokaoChoices(stem), { stem: "题目", choices: ["a", "b", "c", "d"].map(id => `![图](figure:${id})`) });
  assert.equal(splitGaokaoChoices(stem.replace(String.raw`\text{D.}`, String.raw`\text{?}`)), null);
});
