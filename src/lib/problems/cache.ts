import { coerceCollectionList, type Collection } from "./collections";
import { coerceProblemList } from "./coerce";
import { readLegacyProblems } from "./legacy";
import type { Problem } from "./types";

const CACHE_PREFIX = "moti-cloud-cache-v1:";

function keyFor(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

export function readCachedNotebook(userId: string): { problems: Problem[]; collections: Collection[] } {
  if (typeof window === "undefined" || !userId) return { problems: [], collections: [] };
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return { problems: readLegacyProblems(), collections: [] };
    const parsed = JSON.parse(raw) as { problems?: unknown; collections?: unknown };
    const cached = coerceProblemList(parsed.problems);
    const collections = coerceCollectionList(parsed.collections);
    return {
      problems: cached.length ? cached : readLegacyProblems(),
      collections,
    };
  } catch {
    return { problems: readLegacyProblems(), collections: [] };
  }
}

export function readCachedProblems(userId: string): Problem[] {
  return readCachedNotebook(userId).problems;
}

export function writeCachedProblems(userId: string, problems: Problem[], collections: Collection[] = []): void {
  if (typeof window === "undefined" || !userId) return;
  const slim = problems.map((p) => ({
    ...p,
    sourceImage: undefined,
    figures: p.figures.map((f) => ({ ...f, image: undefined, svg: "" })),
  }));
  try {
    window.localStorage.setItem(
      keyFor(userId),
      JSON.stringify({ problems: slim, collections, savedAt: Date.now() }),
    );
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
