import assert from "node:assert/strict";
import { test } from "node:test";
import {
  distribution,
  linkedProblem,
  uniqueLinks,
  exportRows,
  recallCandidates,
  type AnalysisLink,
  type AnalysisRow,
  type ExamAnalysis,
} from "./model.ts";
import type { Problem } from "../problems/types";
import type { Collection } from "../problems/collections";
const p = (id: string, collectionId = "lesson", stem = "题干"): Problem => ({
  id,
  collectionId,
  stem,
  title: id,
  analysis: "",
  correctAnswer: "",
  figures: [],
  tags: [],
  createdAt: 1,
  updatedAt: 1,
  sourceKind: "text",
  subject: "algebra",
  difficulty: 1,
  myAnswer: "",
  notes: "",
  errorReason: "unknown",
  mastery: "unpracticed",
  reviewCount: 0,
  nextReviewAt: 0,
});
const link = (id: string, extra: Partial<AnalysisLink> = {}): AnalysisLink => ({
  problemId: id,
  parts: [],
  relation: "method",
  reason: "共同步骤",
  difference: "不同条件",
  selected: true,
  duplicateKey: "",
  verified: true,
  ...extra,
});
const row = (id: string, links: AnalysisLink[]): AnalysisRow => ({
  problemId: id,
  links,
  topic: "",
  structure: "",
  method: "",
  notes: "",
  analyzedAt: 1,
  scannedCount: 20,
  reviewedCount: 10,
});
const report = (rows: AnalysisRow[]): ExamAnalysis => ({
  version: 1,
  collectionId: "exam",
  rows,
  revision: 1,
  updatedAt: 1,
  origin: "reviewed",
  summary: "",
  fingerprints: {},
});
test("阅读去重跨原题且保留未合并的数值变式", () => {
  const rows = [
    row("q1", [link("a", { duplicateKey: "same" }), link("variant")]),
    row("q2", [link("b", { duplicateKey: "same" }), link("c", { selected: false })]),
  ];
  assert.deepEqual(
    uniqueLinks(rows).map((r) => r.links.map((l) => l.problemId)),
    [["a", "variant"], []],
  );
  assert.equal(uniqueLinks(rows, false)[1].links[0].problemId, "c");
});
test("导出可追加未勾选的补充训练，跨组去重且优先保留原先选题", () => {
  const rows = [
    row("q1", [
      link("duplicate", { relation: "support", selected: false, duplicateKey: "same" }),
      link("extra", { relation: "support", selected: false }),
      link("unselected-method", { selected: false }),
      link("selected-support", { relation: "support" }),
    ]),
    row("q2", [
      link("chosen", { duplicateKey: "same" }),
      link("extra", { relation: "support", selected: false }),
    ]),
  ];
  const before = structuredClone(rows);
  assert.deepEqual(
    exportRows(rows).map((r) => r.links.map((l) => l.problemId)),
    [["selected-support"], ["chosen"]],
  );
  assert.deepEqual(
    exportRows(rows, true).map((r) => r.links.map((l) => l.problemId)),
    [["extra", "selected-support"], ["chosen"]],
  );
  assert.deepEqual(rows, before);
});

test("导出先筛选原题组再去重，不被未导出的组抢占同题", () => {
  const rows = [
    row("q1", [link("a", { duplicateKey: "same" })]),
    row("q2", [link("b", { duplicateKey: "same" })]),
  ];
  assert.deepEqual(
    exportRows(rows, false, ["q2"]).map((r) => [r.problemId, ...r.links.map((l) => l.problemId)]),
    [["q2", "b"]],
  );
  assert.deepEqual(exportRows(rows, false, []), []);
});

test("同讲次多题交叉命中不叠加；补充不增加覆盖或针对性得分", () => {
  const c = {
    id: "lesson",
    name: "讲",
    groupName: "组",
    kind: "lesson",
    createdAt: 1,
    updatedAt: 1,
    sortOrder: 1,
  } as Collection;
  const stats = distribution(
    report([
      row("q1", [link("a"), link("s", { relation: "support" })]),
      row("q2", [link("a", { relation: "variant" })]),
    ]),
    [p("a"), p("s")],
    [c],
  )[0];
  assert.equal(stats.count, 2);
  assert.equal(stats.variant, 1);
  assert.equal(stats.method, 0);
  assert.equal(stats.support, 1);
  assert.equal(stats.score, 7);
  assert.deepEqual(stats.coverage, [1, 2]);
});
test("截取小问保留共享条件、对应图与正确解析，不串入其他小问", () => {
  const q = p("a", "lesson", "已知共同条件。\n（1）第一题\n（2）第二题");
  q.correctAnswer = "（1）1\n（2）2";
  q.analysis = "共用推理\n（1）第一解\n（2）第二解";
  q.figures = [
    { id: "f1", subproblem: 1, title: "", caption: "", svg: "" },
    { id: "f2", subproblem: 2, title: "", caption: "", svg: "" },
  ];
  const result = linkedProblem(q, link("a", { parts: [2] }));
  assert.match(result.stem, /共同条件/);
  assert.doesNotMatch(result.stem, /第一题/);
  assert.equal(result.figures[0].id, "f2");
  assert.match(result.analysis, /共用推理/);
  assert.doesNotMatch(result.analysis, /第一解/);
  assert.throws(() => linkedProblem(q, link("a", { parts: [3] })));
});
test("不可靠的解析切分保留完整内容并明确标注", () => {
  const q = p("a", "lesson", "（1）甲\n（2）乙");
  q.analysis = "两问一起证明";
  assert.match(linkedProblem(q, link("a", { parts: [2] })).analysis, /完整内容/);
});
test("检索根据条件与方法而非章节名，排除原卷自身", () => {
  const target = p("q", "exam", "等边三角形，中点与旋转");
  const similar = p("a", "other", "等边三角形的中点");
  similar.analysis = "旋转构造全等";
  assert.equal(
    recallCandidates(target, [target, similar, p("b", "same-title", "抛物线")], ["旋转", "中点"])[0]
      .id,
    "a",
  );
  assert.ok(!recallCandidates(target, [target], []).length);
});
