import { z } from "zod";
import type { Figure } from "../problems/types";

export const knowledgeScopeSchema = z.union([
  z.object({ collectionId: z.string().min(1).max(80) }),
  z.object({ problemIds: z.array(z.string().min(1).max(80)).min(1).max(40) }),
]);
export type KnowledgeScope = z.infer<typeof knowledgeScopeSchema>;
export type KnowledgeKind = "single" | "lecture" | "selection";
export function knowledgeKind(scope: KnowledgeScope): KnowledgeKind {
  return "collectionId" in scope ? "lecture" : new Set(scope.problemIds).size === 1 ? "single" : "selection";
}
export const KNOWLEDGE_PROMPT_VERSION = 2;
export function knowledgeLabels(kind?: KnowledgeKind) {
  return kind === "single" ? {
    name: "单题思路复盘", description: "看懂这一题的突破口，把关键想法带到下一题。",
    takeaway: "这一题，带走什么", concepts: "本题用到的知识", methods: "突破口与推理链",
    signal: "题面线索", idea: "突破口：为什么想到这一步", steps: "推理链", example: "关键变形与结果",
    pitfalls: "卡点与易错原因", checklist: "下次遇到类似题", selfChecks: "变式与迁移自测", coverage: "本题方法卡",
  } : {
    name: kind === "selection" ? "多题方法归纳" : "整讲方法体系", description: "归并题型、比较方法，建立遇到新题时的选法顺序。",
    takeaway: kind === "selection" ? "这组题，带走什么" : "这一讲，带走什么", concepts: "核心知识与适用条件", methods: "题型与方法对照",
    signal: "识别信号与适用条件", idea: "为什么选它：与其他方法比较", steps: "通用解题步骤", example: "代表题的关键转化",
    pitfalls: "适用边界与易错点", checklist: "方法选择路线", selfChecks: "跨题型辨析自测", coverage: "逐题方法索引",
  };
}
const text = z.string().trim().min(1).max(4000);
const refs = z.array(z.string().min(1).max(80)).min(1).max(40);
export const knowledgeContentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  takeaway: text,
  concepts: z.array(z.object({ title: text, explanation: text, problemIds: refs })).min(1).max(12),
  methods: z.array(z.object({
    title: text, signal: text, idea: text, steps: z.array(text).min(1).max(8),
    example: text, pitfalls: text, problemIds: refs,
  })).min(1).max(12),
  checklist: z.array(text).min(1).max(10),
  selfChecks: z.array(z.object({ question: text, answer: text })).min(1).max(8),
  coverage: z.array(z.object({ problemId: z.string().min(1).max(80), takeaway: text })).min(1).max(40),
  uncertainties: z.array(text).max(20),
});
export type KnowledgeContent = z.infer<typeof knowledgeContentSchema>;
export type KnowledgeSource = { id: string; title: string; label?: string; stem?: string; figures?: Figure[] };
export type KnowledgeReport = {
  kind?: KnowledgeKind;
  promptVersion?: number;
  content: KnowledgeContent;
  sources: KnowledgeSource[];
  fingerprint: string;
  generatedAt: number;
};

// Only attach current source text when it is the exact version used by the note.
export function withKnowledgeSources(report: KnowledgeReport, current: { fingerprint: string; sources: KnowledgeSource[] }): KnowledgeReport {
  return report.fingerprint === current.fingerprint ? { ...report, sources: current.sources } : report;
}

export function knowledgeSourceName(source: KnowledgeSource): string {
  return source.label ? `${source.label} · ${source.title}` : source.title;
}

// Match explicit original question numbers in the worked example. Never assume
// the first associated question is the one explained in the example.
export function representativeSource(report: KnowledgeReport, method: KnowledgeContent["methods"][number]): KnowledgeSource | undefined {
  const associated = method.problemIds.map(id => report.sources.find(s => s.id === id)).filter((s): s is KnowledgeSource => !!s);
  const mentioned = associated.map(source => {
    const label = /^(例题|习题)\s*(\d+)$/.exec(source.label || "");
    const pattern = label ? new RegExp(`${label[1] === "例题" ? "例(?:题)?" : "习题"}\\s*${label[2]}(?!\\d)`) : undefined;
    return { source, index: pattern ? method.example.search(pattern) : -1 };
  }).filter(v => v.index >= 0).sort((a, b) => a.index - b.index);
  return mentioned[0]?.source || associated[0];
}

export function parseKnowledgeContent(raw: unknown, ids: string[]): KnowledgeContent {
  const content = knowledgeContentSchema.parse(raw);
  // JSON can turn LaTeX \tau / \frac / \begin into control characters.
  const greek: Record<string, string> = { "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "τ": "tau", "Δ": "Delta", "θ": "theta", "λ": "lambda", "μ": "mu", "π": "pi", "σ": "sigma", "φ": "phi", "ω": "omega" };
  const cleanMath = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, "").replace(/\$\$[\s\S]*?\$\$|\$[^$]*?\$/g, (math) =>
    math.replace(/\t(?=[A-Za-z])/g, "\\t").replace(/\f(?=[A-Za-z])/g, "\\f").replace(/\u0008(?=[A-Za-z])/g, "\\b").replace(/\r(?=[A-Za-z])/g, "\\r")
      .replace(/[αβγδτΔθλμπσφω]/g, c => `\\${greek[c]} `));
  const clean = (value: unknown): unknown => typeof value === "string" ? cleanMath(value)
    : Array.isArray(value) ? value.map(clean)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)])) : value;
  const allowed = new Set(ids);
  const referenced = [...content.concepts, ...content.methods].flatMap((item) => item.problemIds);
  if (referenced.some((id) => !allowed.has(id))) throw new Error("归纳引用了范围外的题目。");
  const covered = content.coverage.map((item) => item.problemId);
  if (covered.length !== allowed.size || new Set(covered).size !== allowed.size || covered.some((id) => !allowed.has(id))) {
    throw new Error("归纳未完整覆盖所选题目，请重试。");
  }
  return knowledgeContentSchema.parse(clean(content));
}

export function knowledgeScopeKey(scope: KnowledgeScope): string {
  return "collectionId" in scope ? `collection:${scope.collectionId}` : `problems:${[...new Set(scope.problemIds)].sort().join(",")}`;
}

export function knowledgeMarkdown(report: KnowledgeReport): string {
  const c = report.content;
  const l = knowledgeLabels(report.kind);
  const names = new Map(report.sources.map((p) => [p.id, knowledgeSourceName(p)]));
  const links = (ids: string[]) => ids.map((id) => `[${names.get(id) || id}](http://127.0.0.1:8080/p/${encodeURIComponent(id)})`).join("、");
  return [`# ${c.title}`, l.name, c.takeaway,
    ...(report.kind === "single" && report.sources[0]?.stem ? ["## 原题", report.sources[0].stem] : []),
    `## ${l.concepts}`, ...c.concepts.map((v) => `### ${v.title}\n\n${v.explanation}\n\n对应题目：${links(v.problemIds)}`),
    `## ${l.methods}`, ...c.methods.map((v) => `### ${v.title}\n\n${l.signal}：${v.signal}\n\n${l.idea}：${v.idea}\n\n${v.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n${l.example}：${v.example}\n\n${l.pitfalls}：${v.pitfalls}\n\n对应题目：${links(v.problemIds)}`),
    `## ${l.checklist}`, c.checklist.map((v) => `- ${v}`).join("\n"), `## ${l.selfChecks}`, ...c.selfChecks.map((v) => `问：${v.question}\n\n答：${v.answer}`),
    `## ${l.coverage}`, ...c.coverage.map((v) => `${links([v.problemId])}：${v.takeaway}`),
    ...(report.kind !== "single" ? ["## 完整原题附录", ...report.sources.map(s => `### ${knowledgeSourceName(s)}\n\n${s.stem || "此笔记未保存原题快照，请回到题库核对。"}\n\n${links([s.id])}`)] : []),
    ...(c.uncertainties.length ? ["## 待核对", ...c.uncertainties] : []),
    `生成时间：${new Date(report.generatedAt).toISOString()}。AI 归纳，请结合原题核对。`,
  ].join("\n\n");
}
