import { sortBySourceOrder } from "./order.ts";
import type { Problem } from "./types";

export function orderBrowseProblems(problems: Problem[], collectionIds: string[]): Problem[] {
  const grouped = new Map<string, Problem[]>();
  const known = new Set(collectionIds);
  for (const problem of problems) {
    const key = problem.collectionId && known.has(problem.collectionId) ? problem.collectionId : "";
    const items = grouped.get(key) ?? [];
    items.push(problem);
    grouped.set(key, items);
  }
  return [...collectionIds, ""].flatMap((id) => sortBySourceOrder(grouped.get(id) ?? []));
}
