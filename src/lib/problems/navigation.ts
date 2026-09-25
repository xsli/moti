export function navigationPosition(ids: string[], currentId: string, availableIds: string[]) {
  const available = new Set(availableIds);
  const ordered = [...new Set(ids)].filter((id) => available.has(id));
  const index = ordered.indexOf(currentId);
  return {
    index,
    total: ordered.length,
    previous: index > 0 ? ordered[index - 1] : undefined,
    next: index >= 0 ? ordered[index + 1] : undefined,
  };
}

const PREFIX = "moti-problem-navigation:";

export function saveNavigation(key: string, ids: string[]) {
  try { window.sessionStorage.setItem(PREFIX + key, JSON.stringify(ids)); } catch { /* use group order */ }
}

export function readNavigation(key?: string): string[] | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(PREFIX + key) || "null");
    return Array.isArray(value) && value.every((id) => typeof id === "string") ? value : null;
  } catch { return null; }
}
