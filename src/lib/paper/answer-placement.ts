import type { ExamItem } from "./layout";

export type AnswerPlacement = "inline" | "end";

export function coerceAnswerPlacement(value: unknown): AnswerPlacement {
  return value === "end" ? "end" : "inline";
}

// Keep the already-normalized labels and section order, without note-only sections.
export function handoutAnswerItems(items: ExamItem[]): ExamItem[] {
  const result: ExamItem[] = [];
  let heading: Extract<ExamItem, { kind: "heading" }> | undefined;
  for (const item of items) {
    if (item.kind === "heading") {
      heading = item;
    } else if (item.role !== "points") {
      if (heading) result.push(heading);
      heading = undefined;
      result.push(item);
    }
  }
  return result;
}
