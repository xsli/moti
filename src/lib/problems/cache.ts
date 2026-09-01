import { coerceCollectionList, type Collection } from "./collections";
import { coerceProblemList } from "./coerce";
import { readLegacyProblems } from "./legacy";
import type { Problem } from "./types";

const CACHE_PREFIX = "moti-cloud-cache-v1:";

function keyFor(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

function parseNotebook(raw: string | null): { problems: Problem[]; collections: Collection[] } {
  if (!raw) return { problems: [], collections: [] };
  try {
    const parsed = JSON.parse(raw) as { problems?: unknown; collections?: unknown };
    return {
      problems: coerceProblemList(parsed.problems),
      collections: coerceCollectionList(parsed.collections),
    };
  } catch {
    return { problems: [], collections: [] };
  }
}

function recoverAnyNotebook(): { problems: Problem[]; collections: Collection[] } {
  if (typeof window === "undefined") return { problems: [], collections: [] };
  let best: { problems: Problem[]; collections: Collection[] } = { problems: [], collections: [] };
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(CACHE_PREFIX) || key === "moti-notebook-v1") {
        const parsed = parseNotebook(window.localStorage.getItem(key));
        const extra = key === "moti-notebook-v1" && !parsed.problems.length ? { problems: readLegacyProblems(), collections: parsed.collections } : parsed;
        if (extra.problems.length > best.problems.length) best = extra;
      }
    }
  } catch {
    /* ignore */
  }
  if (!best.problems.length) {
    const legacy = readLegacyProblems();
    if (legacy.length) best = { problems: legacy, collections: best.collections };
  }
  return best;
}

export function readCachedNotebook(userId: string): { problems: Problem[]; collections: Collection[] } {
  if (typeof window === "undefined" || !userId) return { problems: [], collections: [] };
  const own = parseNotebook(window.localStorage.getItem(keyFor(userId)));
  if (own.problems.length) {
    return {
      problems: own.problems,
      collections: own.collections.length ? own.collections : recoverAnyNotebook().collections,
    };
  }
  const recovered = recoverAnyNotebook();
  if (recovered.problems.length) return recovered;
  return { problems: readLegacyProblems(), collections: own.collections };
}

export function readCachedProblems(userId: string): Problem[] {
  return readCachedNotebook(userId).problems;
}

function paperFromStorage(): unknown {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem("moti-paper-shared");
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCachedProblems(userId: string, problems: Problem[], collections: Collection[] = []): void {
  if (typeof window === "undefined" || !userId) return;
  if (!problems.length) {
    const existing = parseNotebook(window.localStorage.getItem(keyFor(userId)));
    const recovered = existing.problems.length ? existing : recoverAnyNotebook();
    if (recovered.problems.length) return;
  }
  const slim = problems.map((p) => ({
    ...p,
    sourceImage: undefined,
    figures: p.figures.map((f) => ({ ...f, image: undefined, svg: "" })),
  }));
  try {
    window.localStorage.setItem(
      keyFor(userId),
      JSON.stringify({ problems: slim, collections, paper: paperFromStorage() ?? undefined, savedAt: Date.now() }),
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
      app: "解集",
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
