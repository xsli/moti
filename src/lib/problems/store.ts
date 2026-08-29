import { toast } from "sonner";
import { create } from "zustand";
import { exportNotebookJson, parseImportedNotebook, readCachedNotebook, writeCachedProblems } from "./cache";
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
  addCollection: (input: { name: string; kind?: CollectionKind; groupName?: string }) => Promise<string>;
  updateCollection: (id: string, patch: Partial<Pick<Collection, "name" | "kind" | "groupName">>) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  renameFolder: (from: string, to: string) => Promise<number>;
  reorderCollections: (ids: string[]) => Promise<void>;
  reorderProblems: (ids: string[]) => Promise<void>;
  importNotebook: (text: string) => Promise<{ problems: number; collections: number }>;
  exportNotebook: () => Promise<string>;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && error.message === "Unauthorized";
}

function persist(userId: string | null, problems: Problem[], collections: Collection[], allowEmpty = false) {
  if (!userId) return;
  const existing = readCachedNotebook(userId);
  if (!problems.length && !allowEmpty && existing.problems.length) {
    problems = existing.problems;
  }
  if (!collections.length && !allowEmpty && existing.collections.length) {
    collections = existing.collections;
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
          data: { incoming: local.length ? local : undefined, collections: localCols.length ? localCols : undefined },
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
      if (!collections.length && localCols.length) collections = localCols;
      persist(userId, problems.length ? problems : local, collections.length ? collections : localCols);
      const missingCols = localCols.filter((item) => !collections.some((row) => row.id === item.id));
      const serverCols = notebook.collections ?? [];
      if (missingCols.length || (localCols.length && !serverCols.length)) {
        const pushed = await pushCollectionsFn({ data: { collections } });
        collections = mergeCollections(pushed.collections, collections);
      }
      const groupedLocal = problems.filter((item) => item.collectionId);
      const strippedOnServer = groupedLocal.filter((item) => {
        const row = notebook.problems.find((p) => p.id === item.id);
        return !row?.collectionId;
      });
      if (strippedOnServer.length) {
        const { pushProblems: pushAgain } = await import("./api");
        await pushAgain({ data: { problems: strippedOnServer } });
      }

      persist(userId, problems.length ? problems : local, collections.length ? collections : localCols);
      set({
        problems: problems.length ? problems : local,
        collections: collections.length ? collections : localCols,
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
      const keepProblems = get().problems.length ? get().problems : cached.problems;
      const keepCols = get().collections.length ? get().collections : cached.collections;
      if (keepProblems.length || keepCols.length) {
        set({
          problems: keepProblems,
          collections: keepCols,
          status: "ready",
          userId,
          error: null,
        });
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
      groupName: (input.groupName ?? "").trim().slice(0, 40),
      sortOrder: 0,
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
  renameFolder: async (from, to) => {
    const nextName = to.trim().slice(0, 40);
    const previous = get().collections;
    const now = Date.now();
    const changed = previous.filter((item) => item.groupName === from);
    if (!changed.length) return 0;
    const next = previous.map((item) =>
      item.groupName === from ? { ...item, groupName: nextName, updatedAt: now } : item,
    );
    set({ collections: next });
    persist(get().userId, get().problems, next);
    try {
      const { upsertCollectionFn } = await import("./api");
      for (const item of next.filter((row) => changed.some((c) => c.id === row.id))) {
        await upsertCollectionFn({ data: item });
      }
    } catch (error) {
      if (isUnauthorized(error)) throw error;
      toast.error("大组改名先记在这台设备上。");
    }
    return changed.length;
  },
  reorderCollections: async (ids) => {
    if (ids.length < 2) return;
    const previous = get().collections;
    const rank = new Map(ids.map((id, index) => [id, index + 1]));
    const now = Date.now();
    const next = previous.map((item) => {
      const sortOrder = rank.get(item.id);
      return sortOrder == null ? item : { ...item, sortOrder, updatedAt: now };
    });
    const changed = ids
      .map((id) => next.find((item) => item.id === id))
      .filter(Boolean) as Collection[];
    set({ collections: next });
    persist(get().userId, get().problems, next);
    try {
      const { pushCollectionsFn } = await import("./api");
      await pushCollectionsFn({ data: { collections: changed } });
      set({ syncedAt: Date.now() });
    } catch (error) {
      if (isUnauthorized(error)) {
        set({ collections: previous });
        persist(get().userId, get().problems, previous);
        throw error;
      }
      toast.error("分组顺序已记下，云端稍后再同步。");
    }
  },
  reorderProblems: async (ids) => {
    if (ids.length < 2) return;
    const previous = get().problems;
    const first = previous.find((item) => item.id === ids[0]);
    const batchId = first?.collectionId ? `order:${first.collectionId}` : `order:${ids[0]}`;
    const now = Date.now();
    const rank = new Map(ids.map((id, i) => [id, i + 1]));
    const next = previous.map((item) => {
      const order = rank.get(item.id);
      if (!order) return item;
      return { ...item, sourceOrder: order, sourceBatchId: batchId, updatedAt: now };
    });
    set({ problems: next });
    persist(get().userId, next, get().collections);
    const changed = ids
      .map((id) => next.find((item) => item.id === id))
      .filter(Boolean) as Problem[];
    try {
      const { pushProblems } = await import("./api");
      const chunk = 40;
      for (let i = 0; i < changed.length; i += chunk) {
        await pushProblems({ data: { problems: changed.slice(i, i + chunk) } });
      }
      set({ syncedAt: Date.now() });
    } catch (error) {
      if (isUnauthorized(error)) {
        set({ problems: previous });
        persist(get().userId, previous, get().collections);
        throw error;
      }
      toast.error("顺序已记下，云端稍后再同步。");
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
  importNotebook: async (text) => {
    const incoming = parseImportedNotebook(text);
    if (!incoming.problems.length && !incoming.collections.length) {
      throw new Error("文件里没有题目或分组");
    }
    const collections = mergeCollections(incoming.collections, get().collections);
    const problems = mergeProblems(incoming.problems, get().problems);
    set({ problems, collections });
    persist(get().userId, problems, collections);
    try {
      const { pushProblems, pushCollectionsFn } = await import("./api");
      if (incoming.collections.length) {
        const pushedCols = await pushCollectionsFn({ data: { collections } });
        const nextCols = mergeCollections(pushedCols.collections, collections);
        set({ collections: nextCols });
        persist(get().userId, get().problems, nextCols);
      }
      const chunk = 40;
      for (let i = 0; i < incoming.problems.length; i += chunk) {
        await pushProblems({ data: { problems: incoming.problems.slice(i, i + chunk) } });
      }
      persist(get().userId, get().problems, get().collections);
      set({ status: "ready", syncedAt: Date.now(), error: null });
    } catch (error) {
      if (isUnauthorized(error)) throw error;
      toast.error("云端暂时没写上。备份已留在这台设备。");
    }
    if (incoming.paper) {
      try {
        const { parseSession } = await import("@/lib/paper/session");
        const { usePaperStore } = await import("@/lib/paper/store");
        const paper = parseSession(incoming.paper);
        const store = usePaperStore.getState();
        store.hydrate(store.userId);
        const current = usePaperStore.getState();
        const templates = [...paper.templates, ...current.templates.filter((t) => !paper.templates.some((p) => p.id === t.id))].slice(0, 20);
        const basket = [...new Set([...paper.basket, ...current.basket])].slice(0, 80);
        usePaperStore.setState({ basket, templates });
        window.localStorage.setItem(
          `moti-paper-v1:${store.userId || "guest"}`,
          JSON.stringify({ basket, templates }),
        );
      } catch {
        /* paper optional */
      }
    }
    return { problems: incoming.problems.length, collections: incoming.collections.length };
  },
  exportNotebook: async () => {
    const { getProblemFn } = await import("./api");
    const local = get().problems;
    const full = await Promise.all(
      local.map(async (item) => {
        const hasMedia = Boolean(item.sourceImage || item.figures.some((fig) => fig.image || fig.svg));
        if (hasMedia) return item;
        try {
          const remote = await getProblemFn({ data: { id: item.id } });
          if (!remote) return item;
          return {
            ...remote,
            sourceImage: remote.sourceImage || item.sourceImage,
            collectionId: remote.collectionId ?? item.collectionId,
            figures: remote.figures.some((f) => f.image || f.svg) ? remote.figures : item.figures,
          };
        } catch {
          return item;
        }
      }),
    );
    let paper: { basket: string[]; templates: unknown[] } | undefined;
    try {
      const { usePaperStore } = await import("@/lib/paper/store");
      const session = usePaperStore.getState();
      paper = { basket: session.basket, templates: session.templates };
    } catch {
      paper = undefined;
    }
    return exportNotebookJson(full, get().collections, paper);
  },
}));

export function selectDueProblems(problems: Problem[]): Problem[] {
  const now = Date.now();
  return problems
    .filter((p) => p.mastery !== "mastered")
    .filter((p) => p.nextReviewAt <= now)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt || b.updatedAt - a.updatedAt);
}
