import {
  ERROR_REASONS,
  SUBJECTS,
  type Figure,
  type Problem,
} from "./types";

const STORAGE_KEY = "moti-notebook-v1";
const MIGRATED_KEY = "moti-notebook-migrated-v1";

function isFigure(value: unknown): value is Figure {
  if (!value || typeof value !== "object") return false;
  const fig = value as Record<string, unknown>;
  return typeof fig.id === "string" && typeof fig.svg === "string";
}

function isProblemShape(value: unknown): value is Problem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.title !== "string") return false;
  if (typeof item.stem !== "string") return false;
  if (!Array.isArray(item.figures) || !item.figures.every(isFigure)) return false;
  if (!(SUBJECTS as readonly string[]).includes(String(item.subject))) return false;
  if (!(ERROR_REASONS as readonly string[]).includes(String(item.errorReason ?? "unknown"))) {
    return false;
  }
  return true;
}

export function readLegacyProblems(): Problem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { state?: { problems?: unknown } };
    const list = parsed?.state?.problems ?? (parsed as { problems?: unknown }).problems;
    if (!Array.isArray(list)) return [];
    return list.filter(isProblemShape);
  } catch {
    return [];
  }
}

export function legacyAlreadyMigrated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MIGRATED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markLegacyMigrated(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    /* ignore quota */
  }
}
