export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 16;
const DISPLAY_PRIORITY_TAGS = ["例题", "习题"];

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

export function tagsForDisplay(tags: string[], max: number): string[] {
  const priority = DISPLAY_PRIORITY_TAGS.filter((tag) => tags.includes(tag));
  const rest = tags.filter((tag) => !DISPLAY_PRIORITY_TAGS.includes(tag));
  return [...priority, ...rest].slice(0, max);
}
