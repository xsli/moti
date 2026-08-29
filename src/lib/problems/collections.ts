export const COLLECTION_KINDS = ["exam", "unit", "lesson", "custom"] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

export const COLLECTION_KIND_LABEL: Record<CollectionKind, string> = {
  exam: "试卷",
  unit: "单元",
  lesson: "课时",
  custom: "分组",
};

export const UNGROUPED_FOLDER = "未分大组";

export interface Collection {
  id: string;
  name: string;
  kind: CollectionKind;
  groupName: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export function isCollectionKind(value: string): value is CollectionKind {
  return (COLLECTION_KINDS as readonly string[]).includes(value);
}

export function coerceGroupName(raw: unknown): string {
  const value = String(raw ?? "").trim().slice(0, 40);
  if (value === "institution" || value === "textbook") return "";
  return value;
}

export function defaultCollectionName(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getMonth() + 1}月${d.getDate()}日拍题`;
}

export function coerceCollection(raw: unknown): Collection | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = String(item.id ?? "").slice(0, 80);
  const name = String(item.name ?? "").trim().slice(0, 40);
  if (!id || !name) return null;
  const kind = isCollectionKind(String(item.kind ?? "")) ? (item.kind as CollectionKind) : "custom";
  return {
    id,
    name,
    kind,
    groupName: coerceGroupName(item.groupName ?? item.bucket),
    sortOrder: Math.max(0, Math.round(Number(item.sortOrder) || 0)),
    createdAt: Number(item.createdAt) || Date.now(),
    updatedAt: Number(item.updatedAt) || Date.now(),
  };
}

export function sortCollectionsByOrder<T extends Pick<Collection, "id" | "sortOrder">>(
  collections: T[],
  fallbackTime: (item: T) => number,
): T[] {
  return [...collections].sort((a, b) => {
    if (a.sortOrder > 0 && b.sortOrder > 0 && a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.sortOrder > 0 && b.sortOrder === 0) return 1;
    if (a.sortOrder === 0 && b.sortOrder > 0) return -1;
    const time = fallbackTime(b) - fallbackTime(a);
    return time || a.id.localeCompare(b.id);
  });
}

export function coerceCollectionList(raw: unknown): Collection[] {
  if (!Array.isArray(raw)) return [];
  const out: Collection[] = [];
  for (const item of raw) {
    const next = coerceCollection(item);
    if (next) out.push(next);
  }
  return out.slice(0, 80);
}

export function mergeCollections(primary: Collection[], secondary: Collection[]): Collection[] {
  const map = new Map<string, Collection>();
  for (const item of [...secondary, ...primary]) {
    const current = map.get(item.id);
    if (!current || item.updatedAt >= current.updatedAt) map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function collectionFolders(collections: { groupName: string }[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of collections) {
    const name = item.groupName.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b, "zh"));
}
