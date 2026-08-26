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

export function exportNotebookJson(
  problems: Problem[],
  collections: Collection[],
  paper?: { basket: string[]; templates: unknown[] },
): string {
  return JSON.stringify(
    {
      app: "墨题",
      version: 2,
      exportedAt: Date.now(),
      problems,
      collections,
      paper: paper ?? undefined,
    },
    null,
    2,
  );
}

export function exportProblemsJson(problems: Problem[]): string {
  return exportNotebookJson(problems, []);
}

export function parseImportedNotebook(text: string): {
  problems: Problem[];
  collections: Collection[];
  paper?: { basket: unknown; templates: unknown };
} {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) {
    return { problems: coerceProblemList(parsed, 400), collections: [] };
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const paper = obj.paper && typeof obj.paper === "object" ? (obj.paper as { basket: unknown; templates: unknown }) : undefined;
  return {
    problems: coerceProblemList(obj.problems, 400),
    collections: coerceCollectionList(obj.collections),
    paper,
  };
}

export function parseImportedProblems(text: string): Problem[] {
  return parseImportedNotebook(text).problems;
}
