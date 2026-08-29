export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 16;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
}

export function appendTag(tags: string[], raw: string): string[] {
  const tag = normalizeTag(raw);
  if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return tags;
  return [...tags, tag];
}

export function applyTagChanges(tags: string[], added: string[], removed: string[] = []): string[] {
  const additions = [...new Set(added.map(normalizeTag).filter(Boolean))];
  const excluded = new Set([...removed, ...additions]);
  const kept = tags.filter((tag) => !excluded.has(tag));
  return [...additions, ...kept].slice(0, MAX_TAGS);
}

export function matchesAllTags(tags: string[], selected: string[]): boolean {
  return selected.every((tag) => tags.includes(tag));
}
