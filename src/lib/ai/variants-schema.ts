import { z } from "zod";
import type { Problem } from "../problems/types";

export const VARIANT_MODES = { numbers: "换数巩固", method: "同方法变式", ladder: "递进题组" } as const;
export const VARIANT_LEVELS = { easier: "降低难度", similar: "接近原题", harder: "提高难度" } as const;
export const VARIANT_METHODS = { primary: "小奥方法", middle: "初中方法", any: "不限" } as const;

export const variantRequestSchema = z.object({
  sourceId: z.string().min(1).max(80),
  mode: z.enum(["numbers", "method", "ladder"]),
  level: z.enum(["easier", "similar", "harder"]),
  method: z.enum(["primary", "middle", "any"]),
  count: z.number().int().min(1).max(5),
  extra: z.string().trim().max(500),
});
export type VariantRequest = z.infer<typeof variantRequestSchema>;

export const variantSchema = z.object({
  title: z.string().trim().min(1).max(80),
  stem: z.string().trim().min(1).max(8000),
  correctAnswer: z.string().trim().min(1).max(2000),
  analysis: z.string().trim().min(1).max(8000),
  difficulty: z.number().int().min(1).max(5),
  change: z.string().trim().min(1).max(600),
});
export type Variant = z.infer<typeof variantSchema>;
export const variantReviewSchema = z.object({
  passed: z.boolean(),
  comment: z.string().trim().min(1).max(1200),
});
export type VariantReview = z.infer<typeof variantReviewSchema>;
export type VariantCandidate = Variant & { review: VariantReview };

export function parseVariants(raw: unknown, count: number, original: string): Variant[] {
  const { candidates } = z.object({ candidates: z.array(variantSchema).length(count) }).parse(raw);
  const normalize = (s: string) => s.replace(/\s+/g, "");
  const stems = new Set([normalize(original)]);
  for (const item of candidates) {
    const stem = normalize(item.stem);
    if (stems.has(stem)) throw new Error("生成了重复题目，请重试。");
    stems.add(stem);
  }
  return candidates;
}

export function variantToProblem(
  candidate: VariantCandidate,
  source: Pick<Problem, "id" | "title" | "subject" | "tags">,
  options: { id: string; collectionId?: string; batchId: string; order: number; now: number },
): Problem {
  const clean = variantSchema.parse(candidate);
  return {
    id: options.id, createdAt: options.now, updatedAt: options.now,
    title: clean.title, stem: clean.stem, correctAnswer: clean.correctAnswer, analysis: clean.analysis,
    difficulty: clean.difficulty as Problem["difficulty"], subject: source.subject,
    sourceKind: "text", figures: [], myAnswer: "", errorReason: "unknown",
    mastery: "new", reviewCount: 0, nextReviewAt: options.now,
    collectionId: options.collectionId || undefined,
    sourceBatchId: options.batchId, sourceOrder: options.order,
    tags: [...new Set(["AI变式", ...source.tags.filter((tag) => !["例题", "习题"].includes(tag))])].slice(0, 8),
    notes: `AI 变式，待人工核验\n原题：${source.title}\n原题链接：/p/${source.id}\n变化：${clean.change}\nAI 复核：${candidate.review.passed ? "未发现明显问题" : "存在疑问"}；${candidate.review.comment}`,
  };
}
