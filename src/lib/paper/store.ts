import { create } from "zustand";
import type { PaperRow, SheetKind } from "./layout";
import type { BlankLines } from "./space";
import {
  addToBasket as addIds,
  applyTemplateRows,
  clearBasket as emptyBasket,
  deleteTemplate as dropTemplate,
  emptySession,
  mergeSession,
  parseSession,
  removeFromBasket as dropId,
  renameTemplate as renameTpl,
  saveTemplate as putTemplate,
  type PaperSession,
  type PaperTemplate,
} from "./session";

const PREFIX = "moti-paper-v1:";
const SHARED = "moti-paper-shared";
const CACHE_PREFIX = "moti-cloud-cache-v1:";

function keyFor(userId: string) {
  return `${PREFIX}${userId || "guest"}`;
}

function parseKey(raw: string | null): PaperSession {
  if (!raw) return emptySession();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "paper" in (parsed as object)) {
      const obj = parsed as { paper?: unknown; templates?: unknown };
      return parseSession(obj.paper ?? obj);
    }
    return parseSession(parsed);
  } catch {
    return emptySession();
  }
}

function readAll(): PaperSession {
  if (typeof window === "undefined") return emptySession();
  let merged = emptySession();
  try {
    merged = mergeSession(merged, parseKey(window.localStorage.getItem(SHARED)));
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(PREFIX) || key.startsWith(CACHE_PREFIX) || key === "moti-notebook-v1") {
        merged = mergeSession(merged, parseKey(window.localStorage.getItem(key)));
      }
    }
  } catch {
    /* ignore broken keys */
  }
  return merged;
}

function isEmpty(session: PaperSession) {
  return !session.templates.length && !session.basket.length;
}

function write(userId: string, session: PaperSession) {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(session);
  try {
    window.localStorage.setItem(SHARED, raw);
    window.localStorage.setItem(keyFor(userId), raw);
  } catch {
    try {
      window.localStorage.setItem(SHARED, raw);
    } catch {
      /* quota */
    }
  }
}

function pushRemote(userId: string, session: PaperSession) {
  if (!userId || userId === "guest" || isEmpty(session)) return;
  void import("./api")
    .then(({ putPaperSessionFn }) =>
      putPaperSessionFn({ data: { basket: session.basket, templates: session.templates } }),
    )
    .catch(() => {
      /* offline */
    });
}

function pullRemote(userId: string, apply: (session: PaperSession) => void) {
  if (!userId || userId === "guest") return;
  void import("./api")
    .then(async ({ getPaperSessionFn }) => {
      const raw = (await getPaperSessionFn()).payload;
      const remote = parseSession(raw ? JSON.parse(raw) : {});
      const merged = mergeSession(readAll(), remote);
      apply(merged);
      if (!isEmpty(merged) && isEmpty(remote)) pushRemote(userId, merged);
    })
    .catch(() => {
      /* offline */
    });
}

interface PaperState extends PaperSession {
  userId: string;
  hydrate: (userId: string) => void;
  addToBasket: (ids: string[]) => number;
  removeFromBasket: (id: string) => void;
  clearBasket: () => void;
  saveTemplate: (input: {
    name: string;
    title: string;
    withAnswers: boolean;
    blankLines?: BlankLines;
    blankAuto?: boolean;
    sheetKind?: SheetKind;
    rows: PaperRow[];
    id?: string;
  }) => string;
  deleteTemplate: (id: string) => void;
  renameTemplate: (id: string, name: string) => void;
  templateById: (id: string) => PaperTemplate | undefined;
  liveRows: (template: PaperTemplate, available: Set<string>) => PaperRow[];
}

function applySession(userId: string, session: PaperSession, set: (partial: Partial<PaperState>) => void) {
  write(userId, session);
  set({ userId, basket: session.basket, templates: session.templates });
}

export const usePaperStore = create<PaperState>()((set, get) => ({
  userId: "guest",
  basket: [],
  templates: [],
  hydrate: (userId) => {
    const id = userId || "guest";
    const next = mergeSession(readAll(), { basket: get().basket, templates: get().templates });
    if (!isEmpty(next)) write(id, next);
    set({ userId: id, ...next });
    pullRemote(id, (session) => applySession(id, session, set));
  },
  addToBasket: (ids) => {
    const prev = get().basket.length;
    const next = addIds(get(), ids);
    write(get().userId, next);
    set({ basket: next.basket });
    pushRemote(get().userId, next);
    return next.basket.length - prev;
  },
  removeFromBasket: (id) => {
    const next = dropId(get(), id);
    write(get().userId, next);
    set({ basket: next.basket });
    pushRemote(get().userId, next);
  },
  clearBasket: () => {
    const next = emptyBasket(get());
    write(get().userId, next);
    set({ basket: next.basket });
    pushRemote(get().userId, next);
  },
  saveTemplate: (input) => {
    const id = input.id ?? crypto.randomUUID();
    const next = putTemplate(get(), { ...input, id });
    write(get().userId, next);
    set({ templates: next.templates });
    pushRemote(get().userId, next);
    return id;
  },
  deleteTemplate: (id) => {
    const next = dropTemplate(get(), id);
    write(get().userId, next);
    set({ templates: next.templates });
    pushRemote(get().userId, next);
  },
  renameTemplate: (id, name) => {
    const next = renameTpl(get(), id, name);
    write(get().userId, next);
    set({ templates: next.templates });
    pushRemote(get().userId, next);
  },
  templateById: (id) => get().templates.find((item) => item.id === id),
  liveRows: (template, available) => applyTemplateRows(template.rows, available),
}));
