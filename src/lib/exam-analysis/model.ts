import { z } from "zod";
import type { Problem } from "../problems/types";
import type { Collection } from "../problems/collections";
import { splitStemSections } from "../problems/subproblems.ts";

export const RELATION_LABEL = {
  exact: "原题",
  variant: "变形题",
  method: "方法相似",
  support: "补充训练",
} as const;
export type Relation = keyof typeof RELATION_LABEL;
export const relationSchema = z.enum(["exact", "variant", "method", "support"]);
const text = z.string().max(8000);
export const linkSchema = z.object({
  problemId: z.string().min(1).max(100),
  parts: z.array(z.number().int().min(1).max(99)).max(30),
  relation: relationSchema,
  reason: text,
  difference: text,
  selected: z.boolean(),
  // Explicitly reviewed duplicate families; never merge numerical variants automatically.
  duplicateKey: z.string().max(200),
  verified: z.boolean(),
  excerpt: z
    .object({ stem: text, correctAnswer: z.string().max(30000), analysis: z.string().max(40000) })
    .optional(),
});
export const rowSchema = z.object({
  problemId: z.string().min(1).max(100),
  topic: text,
  structure: text,
  method: text,
  notes: text,
  links: z.array(linkSchema).max(1000),
  analyzedAt: z.number(),
  scannedCount: z.number().int().nonnegative(),
  reviewedCount: z.number().int().nonnegative(),
  fingerprints: z.record(z.string(), z.string()).optional(),
});
export const reportSchema = z.object({
  version: z.literal(1),
  collectionId: z.string().min(1).max(100),
  revision: z.number().int().nonnegative(),
  updatedAt: z.number(),
  origin: z.enum(["reviewed", "ai", "mixed"]),
  summary: text,
  rows: z.array(rowSchema).max(100),
  fingerprints: z.record(z.string(), z.string()),
});
export type AnalysisLink = z.infer<typeof linkSchema>;
export type AnalysisRow = z.infer<typeof rowSchema>;
export type ExamAnalysis = z.infer<typeof reportSchema>;
export const linkKey = (l: Pick<AnalysisLink, "problemId" | "parts">) =>
  `${l.problemId}:${[...l.parts].sort((a, b) => a - b).join(",")}`;
export const familyKey = (l: AnalysisLink) => l.duplicateKey || linkKey(l);
export const relationWeight: Record<Relation, number> = {
  exact: 5,
  variant: 3,
  method: 1,
  support: 0,
};

export function normalizeStem(s: string) {
  return s
    .replace(/\\(?:left|right|,|;|!|quad|qquad)/g, "")
    .replace(/\\dfrac/g, "\\frac")
    .replace(/[\s$。．]/g, "");
}

/** Keep shared introductory conditions and matching figures; never silently assign another part's answer. */
export function linkedProblem(p: Problem, l: AnalysisLink): Problem {
  if (l.excerpt)
    return {
      ...p,
      ...l.excerpt,
      figures: p.figures.filter(
        (f) => !f.subproblem || !l.parts.length || l.parts.includes(f.subproblem),
      ),
    };
  if (!l.parts.length) return p;
  const sections = splitStemSections(p.stem);
  if (!l.parts.every((n) => sections.some((s) => s.subproblem === n)))
    throw new Error(`「${p.title}」的小问已变化，请重新核对关联。`);
  const sliceSolution = (raw: string) => {
    const matches = [...raw.matchAll(/(?:^|\n)\s*[（(](\d+)[）)]/g)];
    if (!l.parts.every((n) => matches.some((m) => Number(m[1]) === n)))
      return raw ? `原题完整内容（可能含其他小问）：\n${raw}` : "";
    return [
      raw.slice(0, matches[0].index),
      ...matches.flatMap((m, i) =>
        l.parts.includes(Number(m[1]))
          ? [raw.slice(m.index, matches[i + 1]?.index ?? raw.length)]
          : [],
      ),
    ]
      .join("\n")
      .trim();
  };
  return {
    ...p,
    stem: sections
      .filter((s) => !s.subproblem || l.parts.includes(s.subproblem))
      .map((s) => s.text)
      .join("\n"),
    figures: p.figures.filter((f) => !f.subproblem || l.parts.includes(f.subproblem)),
    correctAnswer: sliceSolution(p.correctAnswer),
    analysis: sliceSolution(p.analysis),
  };
}

export function uniqueLinks(rows: AnalysisRow[], selectedOnly = true) {
  const seen = new Set<string>();
  return rows.map((row) => ({
    ...row,
    links: row.links.filter((l) => {
      if (selectedOnly && !l.selected) return false;
      const key = familyKey(l);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  }));
}

/** Add supplementary practice without replacing an already selected duplicate. */
export function exportRows(rows: AnalysisRow[], includeSupport = false, originalIds?: string[]) {
  if (originalIds) rows = rows.filter((row) => originalIds.includes(row.problemId));
  if (!includeSupport) return uniqueLinks(rows);
  const selectedFamilies = new Set(
    rows.flatMap((row) => row.links.filter((l) => l.selected).map(familyKey)),
  );
  return uniqueLinks(
    rows.map((row) => ({
      ...row,
      links: row.links.filter(
        (l) => l.selected || (l.relation === "support" && !selectedFamilies.has(familyKey(l))),
      ),
    })),
    false,
  );
}

export function distribution(report: ExamAnalysis, problems: Problem[], collections: Collection[]) {
  const ps = new Map(problems.map((p) => [p.id, p])),
    cs = new Map(collections.map((c) => [c.id, c]));
  const chapters = new Map<
    string,
    {
      id: string;
      name: string;
      group: string;
      total: number;
      units: Map<string, Relation>;
      coverage: Set<number>;
      recommended: Set<string>;
    }
  >();
  const counts = new Map<string, number>();
  for (const p of problems)
    if (p.collectionId) counts.set(p.collectionId, (counts.get(p.collectionId) || 0) + 1);
  for (const [i, row] of report.rows.entries())
    for (const l of row.links) {
      const p = ps.get(l.problemId),
        c = p?.collectionId ? cs.get(p.collectionId) : undefined;
      if (!c) continue;
      let entry = chapters.get(c.id);
      if (!entry) {
        entry = {
          id: c.id,
          name: c.name,
          group: c.groupName,
          total: counts.get(c.id) || 0,
          units: new Map(),
          coverage: new Set(),
          recommended: new Set(),
        };
        chapters.set(c.id, entry);
      }
      const old = entry.units.get(familyKey(l));
      if (!old || relationWeight[l.relation] > relationWeight[old])
        entry.units.set(familyKey(l), l.relation);
      if (l.relation !== "support") entry.coverage.add(i + 1);
      if (l.selected) entry.recommended.add(familyKey(l));
    }
  return [...chapters.values()]
    .map((c) => {
      const kinds = { exact: 0, variant: 0, method: 0, support: 0 };
      for (const v of c.units.values()) kinds[v]++;
      return {
        id: c.id,
        name: c.name,
        group: c.group,
        total: c.total,
        count: c.units.size,
        ...kinds,
        coverage: [...c.coverage].sort((a, b) => a - b),
        recommended: c.recommended.size,
        score: kinds.exact * 5 + kinds.variant * 3 + kinds.method + c.coverage.size * 2,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.recommended - a.recommended ||
        b.count - a.count ||
        a.name.localeCompare(b.name),
    );
}

export function groupDistribution(
  report: ExamAnalysis,
  problems: Problem[],
  collections: Collection[],
) {
  const ps = new Map(problems.map((p) => [p.id, p])),
    cs = new Map(collections.map((c) => [c.id, c]));
  const groups = new Map<
    string,
    { units: Map<string, Relation>; coverage: Set<number>; chapters: Set<string> }
  >();
  for (const [i, row] of report.rows.entries())
    for (const l of row.links) {
      const c = cs.get(ps.get(l.problemId)?.collectionId || "");
      if (!c) continue;
      const group = c.groupName || "未分大组";
      let g = groups.get(group);
      if (!g) {
        g = { units: new Map(), coverage: new Set(), chapters: new Set() };
        groups.set(group, g);
      }
      const key = familyKey(l),
        old = g.units.get(key);
      if (!old || relationWeight[l.relation] > relationWeight[old]) g.units.set(key, l.relation);
      g.chapters.add(c.id);
      if (l.relation !== "support") g.coverage.add(i + 1);
    }
  return [...groups]
    .map(([name, g]) => ({
      name,
      total: g.units.size,
      direct: [...g.units.values()].filter((v) => v !== "support").length,
      support: [...g.units.values()].filter((v) => v === "support").length,
      coverage: g.coverage.size,
      chapters: g.chapters.size,
    }))
    .sort((a, b) => b.direct - a.direct || b.coverage - a.coverage || b.total - a.total);
}

/** Retrieval is candidate recall, not a declaration of similarity. Ignore chapter names. */
export function recallCandidates(
  target: Problem,
  corpus: Problem[],
  keywords: string[],
  limit = 60,
) {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().match(/[\u4e00-\u9fa5]{2,}|\\[a-z]+|[a-z]\^\{?\d|[=+<>]/g) || []);
  const base = tokenize(`${target.stem} ${target.analysis} ${target.tags.join(" ")}`);
  return corpus
    .filter((p) => p.collectionId !== target.collectionId)
    .map((p) => {
      const hay = `${p.stem} ${p.analysis} ${p.tags.join(" ")}`.toLowerCase(),
        tokens = tokenize(hay);
      let score = 0;
      for (const k of keywords)
        if (k.trim().length > 1 && hay.includes(k.toLowerCase())) score += 5;
      for (const t of base) if (tokens.has(t)) score += t.length > 2 ? 2 : 0.3;
      if (normalizeStem(p.stem) === normalizeStem(target.stem)) score += 1000;
      return { problem: p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.problem.id.localeCompare(b.problem.id))
    .slice(0, limit)
    .map((x) => x.problem);
}
