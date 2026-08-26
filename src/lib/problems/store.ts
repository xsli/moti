import { toast } from "sonner";
import { create } from "zustand";
import { exportProblemsJson, parseImportedProblems, readCachedNotebook, writeCachedProblems } from "./cache";
import {
  mergeCollections,
  type Collection,
  type CollectionKind,
} from "./collections";
import { mergeProblems } from "./coerce";
import { nextReview } from "./review";
import type { Problem } from "./types";

type Status = "idle" | "loading" | "ready" | "error";

interface ProblemState {
  status: Status;
  error: string | null;
  userId: string | null;
  syncedAt: number | null;
  problems: Problem[];
  collections: Collection[];
  hydrate: (userId: string) => Promise<void>;
  loadProblem: (id: string) => Promise<void>;
  reset: () => void;
  addProblem: (
    input: Omit<Problem, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ) => Promise<string>;
  updateProblem: (id: string, patch: Partial<Problem>) => Promise<void>;
  deleteProblem: (id: string) => Promise<void>;
  markReview: (id: string, remembered: boolean) => Promise<void>;
  addCollection: (input: { name: string; kind?: CollectionKind }) => Promise<string>;
  updateCollection: (id: string, patch: Partial<Pick<Collection, "name" | "kind">>) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  importProblems: (text: string) => Promise<number>;
  exportText: () => string;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && error.message === "Unauthorized";
}

function persist(userId: string | null, problems: Problem[], collections: Collection[], allowEmpty = false) {
  if (!userId) return;
  if (!problems.length && !allowEmpty) {
    const existing = readCachedNotebook(userId);
    if (existing.problems.length) {
      writeCachedProblems(userId, existing.problems, collections.length ? collections : existing.collections);
      return;
    }
  }
  writeCachedProblems(userId, problems, collections);
}

let hydrateInFlight: string | null = null;

export const useProblemStore = create<ProblemState>()((set, get) => ({
  status: "idle",
  error: null,
  userId: null,
  syncedAt: null,
  problems: [],
  collections: [],
  reset: () =>
    set({ status: "idle", error: null, userId: null, syncedAt: null, problems: [], collections: [] }),
  hydrate: async (userId) => {
    if (!userId) return;
    if (hydrateInFlight === userId) return;
    const syncedAt = get().syncedAt;
    if (get().userId === userId && get().status === "ready" && syncedAt && Date.now() - syncedAt < 20_000) {
      return;
    }
    hydrateInFlight = userId;
    const cached = readCachedNotebook(userId);
    if (cached.problems.length || cached.collections.length) {
      set({
        problems: cached.problems,
        collections: cached.collections,
        status: "ready",
        userId,
        error: null,
      });
    } else {
      set({ status: "loading", userId, error: null });
    }
    try {
      const { bootstrapNotebook, getNotebook, pushProblems, pushCollectionsFn } = await import("./api");
      const notebook = await Promise.race([
        getNotebook(),
        new Promise<never>((_, reject) => {
          globalThis.setTimeout(() => reject(new Error("本子打开超时")), 8000);
        }),
      ]);
      const local = cached.problems.length ? cached.problems : get().problems.filter((p) => p.sourceKind !== "sample");
      const localCols = cached.collections.length ? cached.collections : get().collections;
      let problems = notebook.problems;
      let collections = mergeCollections(notebook.collections ?? [], localCols);

      if (!notebook.initialized) {
        const bootstrapped = await bootstrapNotebook({
          data: { incoming: local.length ? local : undefined },
        });
        problems = mergeProblems(bootstrapped.problems, local);
        collections = mergeCollections(bootstrapped.collections ?? [], localCols);
      } else if (notebook.problems.length === 0 && local.length) {
        const pushed = await pushProblems({ data: { problems: local } });
        problems = mergeProblems(pushed.problems, local);
      } else {
        problems = mergeProblems(notebook.problems, local);
        const missing = local.filter((item) => !notebook.problems.some((row) => row.id === item.id));
        if (missing.length) {
          const pushed = await pushProblems({ data: { problems: missing } });
          problems = mergeProblems(pushed.problems, local);
        }
      }

      if (!problems.length && local.length) problems = local;
      const missingCols = localCols.filter((item) => !collections.some((row) => row.id === item.id));
      if (missingCols.length || (localCols.length && !(notebook.collections ?? []).length)) {
        const pushed = await pushCollectionsFn({ data: { collections } });
        collections = mergeCollections(pushed.collections, collections);
      }

      persist(userId, problems, collections);
      set({
        problems,
        collections,
        status: "ready",
        error: null,
        userId,
        syncedAt: Date.now(),
      });
    } catch (error) {
      if (isUnauthorized(error)) {
        return;
      }
      console.error("hydrate notebook failed", error);
      if (get().problems.length || cached.problems.length) {
        if (!get().problems.length && cached.problems.length) {
          set({
            problems: cached.problems,
            collections: cached.collections,
            status: "ready",
            userId,
            error: null,
          });
        }
        return;
      }
      set({
        status: "error",
        userId,
        error: "本子同步失败，请检查网络后重试。",
      });
    } finally {
      if (hydrateInFlight === userId) hydrateInFlight = null;
    }
  },
  loadProblem: async (id) => {
    try {
      const { getProblemFn } = await import("./api");
      const full = await getProblemFn({ data: { id } });
      if (!full) return;
      const previous = get().problems;
      const exists = previous.some((item) => item.id === id);
      const next = exists
        ? previous.map((item) =>
            item.id === id
              ? { ...full, sourceImage: full.sourceImage || item.sourceImage, collectionId: full.collectionId ?? item.collectionId }
              : item,
          )
        : [full, ...previous];
      set({ problems: next });
      persist(get().userId, next, get().collections);
    } catch {
      /* keep the list copy */
    }
  },
  addProblem: async (input) => {
    const id = input.id ?? crypto.randomUUID();
    const timestamp = Date.now();
    const problem: Problem = {
      ...input,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const previous = get().problems;
    const next = [problem, ...previous];
    set({ problems: next });
    persist(get().userId, next, get().collections);
    try {
      const { upsertProblem } = await import("./api");
      await upsertProblem({ data: problem });
      set({ syncedAt: Date.now() });
      return id;
    } catch (error) {
      if (isUnauthorized(error)) {
        set({ problems: previous });
        persist(get().userId, previous, get().collections);
        throw error;
      }
      toast.error("云端暂时没写上。题目已留在这台设备，稍后会自动同步。");
      return id;
    }
  },
  updateProblem: async (id, patch) => {
    const previous = get().problems;
    const current = previous.find((item) => item.id === id);
    if (!current) return;
    const updated: Problem = {
      ...current,
      ...patch,
      id: current.id,
      updatedAt: Date.now(),
    };
    const next = previous.map((item) => (item.id === id ? updated : item));
    set({ problems: next });
    persist(get().userId, next, get().collections);
    try {
      const { upsertProblem } = await import("./api");
      await upsertProblem({ data: updated });
      set({ syncedAt: Date.now() });
    } catch (error) {
      if (isUnauthorized(error)) {
        set({ problems: previous });
        throw error;
      }
      toast.error("云端同步失败，改动先记在这台设备上。");
    }
  },
  deleteProblem: async (id) => {
    const previous = get().problems;
    const next = previous.filter((item) => item.id !== id);
    set({ problems: next });
    persist(get().userId, next, get().collections, true);
    try {
      const { deleteProblemFn } = await import("./api");
      await deleteProblemFn({ data: { id } });
      set({ syncedAt: Date.now() });
    } catch (error) {
      set({ problems: previous });
      persist(get().userId, previous, get().collections);
      if (isUnauthorized(error)) throw error;
      toast.error("删除失败，请稍后再试。");
      throw error;
    }
  },
  markReview: async (id, remembered) => {
    const item = get().problems.find((p) => p.id === id);
    if (!item) return;
    const next = nextReview(item.mastery, remembered, item.reviewCount);
    await get().updateProblem(id, next);
  },
  addCollection: async (input) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const collection: Collection = {
      id,
      name: input.name.trim().slice(0, 40) || "未命名",
      kind: input.kind ?? "custom",
      createdAt: now,
      updatedAt: now,
    };
    const next = [collection, ...get().collections];
    set({ collections: next });
    persist(get().userId, get().problems, next);
    try {
      const { upsertCollectionFn } = await import("./api");
      await upsertCollectionFn({ data: collection });
    } catch (error) {
      if (isUnauthorized(error)) throw error;
      toast.error("分组先记在这台设备上。");
    }
    return id;
  },
  updateCollection: async (id, patch) => {
    const previous = get().collections;
    const current = previous.find((item) => item.id === id);
    if (!current) return;
    const updated: Collection = { ...current, ...patch, id, updatedAt: Date.now() };
    const next = previous.map((item) => (item.id === id ? updated : item));
    set({ collections: next });
    persist(get().userId, get().problems, next);
    try {
      const { upsertCollectionFn } = await import("./api");
      await upsertCollectionFn({ data: updated });
    } catch (error) {
      if (isUnauthorized(error)) throw error;
      toast.error("分组改动先记在这台设备上。");
    }
  },
  deleteCollection: async (id) => {
    const previousCols = get().collections;
    const previousProblems = get().problems;
    const collections = previousCols.filter((item) => item.id !== id);
    const problems = previousProblems.map((item) =>
      item.collectionId === id ? { ...item, collectionId: undefined, updatedAt: Date.now() } : item,
    );
    set({ collections, problems });
    persist(get().userId, problems, collections, true);
    try {
      const { deleteCollectionFn } = await import("./api");
      await deleteCollectionFn({ data: { id } });
    } catch (error) {
      set({ collections: previousCols, problems: previousProblems });
      persist(get().userId, previousProblems, previousCols);
      if (isUnauthorized(error)) throw error;
      toast.error("删除分组失败。");
      throw error;
    }
  },
  importProblems: async (text) => {
    const incoming = parseImportedProblems(text);
    if (!incoming.length) throw new Error("文件里没有题目");
    const merged = mergeProblems(get().problems, incoming);
    set({ problems: merged });
    persist(get().userId, merged, get().collections);
    const { pushProblems } = await import("./api");
    const pushed = await pushProblems({ data: { problems: incoming } });
    persist(get().userId, pushed.problems, get().collections);
    set({ problems: pushed.problems, status: "ready", syncedAt: Date.now(), error: null });
    return incoming.length;
  },
  exportText: () => exportProblemsJson(get().problems),
}));

export function selectDueProblems(problems: Problem[]): Problem[] {
  const now = Date.now();
  return problems
    .filter((p) => p.mastery !== "mastered")
    .filter((p) => p.nextReviewAt <= now)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt || b.updatedAt - a.updatedAt);
}
