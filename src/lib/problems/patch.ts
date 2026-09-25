import type { Problem } from "./types";

const COLUMNS = {
  sourceKind: "source_kind", sourceImage: "source_image", title: "title", stem: "stem",
  figures: "figures_json", subject: "subject", tags: "tags_json", difficulty: "difficulty",
  myAnswer: "my_answer", correctAnswer: "correct_answer", analysis: "analysis", notes: "notes",
  errorReason: "error_reason", mastery: "mastery", reviewCount: "review_count",
  nextReviewAt: "next_review_at", collectionId: "collection_id",
  sourceBatchId: "source_batch_id", sourceOrder: "source_order",
} as const satisfies Partial<Record<keyof Problem, string>>;

// Only explicitly edited fields may be written; list copies omit image payloads.
export function problemPatchFields(patch: Record<string, unknown>, cleaned: Problem): [string, unknown][] {
  return (Object.keys(COLUMNS) as (keyof typeof COLUMNS)[])
    .filter((key) => Object.hasOwn(patch, key))
    .map((key) => [COLUMNS[key], key === "figures" || key === "tags"
      ? JSON.stringify(cleaned[key]) : cleaned[key] ?? null]);
}
