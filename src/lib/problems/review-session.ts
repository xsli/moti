import type { Collection } from "./collections";
import type { Problem } from "./types";

export function buildReviewQueue(due: Problem[], collections: Collection[], options: { folder?: string; group?: string; limit: number }): string[] {
  const groups = new Set(collections.filter((c) => options.folder === undefined || c.groupName === options.folder).map((c) => c.id));
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(50, Math.floor(options.limit))) : 20;
  return due.filter((p) => options.group
    ? p.collectionId === options.group && (options.folder === undefined || groups.has(options.group))
    : options.folder === undefined || Boolean(p.collectionId && groups.has(p.collectionId)))
    .slice(0, limit).map((p) => p.id);
}
