import { coerceProblemList } from "./coerce";
import { readLegacyProblems } from "./legacy";
import type { Problem } from "./types";

const CACHE_PREFIX = "moti-cloud-cache-v1:";

function keyFor(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

export function readCachedProblems(userId: string): Problem[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return readLegacyProblems();
    const parsed = JSON.parse(raw) as { problems?: unknown };
    const cached = coerceProblemList(parsed.problems);
    if (cached.length) return cached;
    return readLegacyProblems();
  } catch {
    return readLegacyProblems();
  }
}

export function writeCachedProblems(userId: string, problems: Problem[]): void {
  if (typeof window === "undefined" || !userId) return;
  const slim = problems.map((p) => ({
    ...p,
    sourceImage: undefined,
    figures: p.figures.map((f) => ({ ...f, image: undefined, svg: "" })),
  }));
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify({ problems: slim, savedAt: Date.now() }));
  } catch {
    /* quota */
  }
}

export function exportProblemsJson(problems: Problem[]): string {
  return JSON.stringify(
    {
      app: "墨题",
      version: 1,
      exportedAt: Date.now(),
      problems,
    },
    null,
    2,
  );
}

export function parseImportedProblems(text: string): Problem[] {
  const parsed = JSON.parse(text) as { problems?: unknown } | unknown[];
  const list = Array.isArray(parsed) ? parsed : (parsed as { problems?: unknown }).problems;
  return coerceProblemList(list);
}
