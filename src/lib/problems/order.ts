import type { Problem } from "./types";

export function sortBySourceOrder(problems: Problem[]): Problem[] {
  const batchTime = new Map<string, number>();
  for (const item of problems) {
    const key = item.sourceBatchId || item.id;
    const t = batchTime.get(key);
    if (t == null || item.createdAt < t) batchTime.set(key, item.createdAt);
  }
  return [...problems].sort((a, b) => {
    const ak = a.sourceBatchId || a.id;
    const bk = b.sourceBatchId || b.id;
    const at = batchTime.get(ak) ?? a.createdAt;
    const bt = batchTime.get(bk) ?? b.createdAt;
    if (at !== bt) return at - bt;
    const ao = a.sourceOrder ?? 10_000;
    const bo = b.sourceOrder ?? 10_000;
    if (ao !== bo) return ao - bo;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id.localeCompare(b.id);
  });
}

export function idsInSourceOrder(problems: Problem[], ids: Iterable<string>): string[] {
  const set = new Set(ids);
  return sortBySourceOrder(problems.filter((item) => set.has(item.id))).map((item) => item.id);
}

export function moveId(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to > ids.length) return ids;
  const copy = [...ids];
  const [item] = copy.splice(from, 1);
  if (!item) return ids;
  const dest = from < to ? to - 1 : to;
  copy.splice(dest, 0, item);
  return copy;
}

export function spliceVisibleOrder(fullIds: string[], visibleIds: string[], nextVisible: string[]): string[] {
  const vis = new Set(visibleIds);
  const queue = [...nextVisible];
  return fullIds.map((id) => (vis.has(id) ? queue.shift() ?? id : id));
}
