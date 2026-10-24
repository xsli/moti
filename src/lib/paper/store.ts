import { create } from "zustand";
import type { PaperRow, SheetKind } from "./layout";
import type { AnswerPlacement } from "./answer-placement";
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
  replaceBasket as replaceIds,
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
  return !session.templates.length && !session.basket.length && !session.basketUpdatedAt && !Object.keys(session.deletedTemplates).length;
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

let remoteWrites: Promise<unknown> = Promise.resolve();

function pushRemote(userId: string, session: PaperSession) {
  if (!userId || userId === "guest") return;
  remoteWrites = remoteWrites.then(() => import("./api"))
    .then(({ putPaperSessionFn }) =>
      putPaperSessionFn({
        data: {
          basket: session.basket,
          basketUpdatedAt: session.basketUpdatedAt,
          templates: session.templates,
          deletedTemplates: session.deletedTemplates,
        },
      }),
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
      if (JSON.stringify(merged) !== JSON.stringify(remote)) pushRemote(userId, merged);
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
  replaceBasket: (ids: string[]) => void;
  removeBasketItems: (ids: string[]) => void;
  saveTemplate: (input: {
    name: string;
    title: string;
    withAnswers: boolean;
    answerPlacement?: AnswerPlacement;
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
  set({
    userId,
    basket: session.basket,
    basketUpdatedAt: session.basketUpdatedAt,
    templates: session.templates,
    deletedTemplates: session.deletedTemplates,
  });
}

export const usePaperStore = create<PaperState>()((set, get) => ({
  userId: "guest",
  basket: [],
  basketUpdatedAt: 0,
  templates: [],
  deletedTemplates: {},
  hydrate: (userId) => {
    const id = userId || "guest";
    const next = mergeSession(readAll(), {
      basket: get().basket,
      basketUpdatedAt: get().basketUpdatedAt,
      templates: get().templates,
      deletedTemplates: get().deletedTemplates,
    });
    if (!isEmpty(next)) write(id, next);
    set({ userId: id, ...next });
    pullRemote(id, (session) => {
      if (get().userId === id) applySession(id, mergeSession(get(), session), set);
    });
  },
  addToBasket: (ids) => {
    const current = mergeSession(get(), readAll());
    const next = addIds(current, ids);
    applySession(get().userId, next, set);
    pushRemote(get().userId, next);
    return next.basket.length - current.basket.length;
  },
  removeFromBasket: (id) => {
    const next = dropId(mergeSession(get(), readAll()), id);
    applySession(get().userId, next, set);
    pushRemote(get().userId, next);
  },
  clearBasket: () => {
    const next = emptyBasket(mergeSession(get(), readAll()));
    applySession(get().userId, next, set);
    pushRemote(get().userId, next);
  },
  replaceBasket: (ids) => {
    const next = replaceIds(mergeSession(get(), readAll()), ids);
    applySession(get().userId, next, set);
    pushRemote(get().userId, next);
  },
  removeBasketItems: (ids) => {
    const current = mergeSession(get(), readAll());
    const removed = new Set(ids);
    const next = replaceIds(current, current.basket.filter((id) => !removed.has(id)));
    applySession(get().userId, next, set);
    pushRemote(get().userId, next);
  },
  saveTemplate: (input) => {
    const id = input.id ?? crypto.randomUUID();
    const next = putTemplate(mergeSession(get(), readAll()), { ...input, id });
    applySession(get().userId, next, set);
    pushRemote(get().userId, next);
    return id;
  },
  deleteTemplate: (id) => {
    const next = dropTemplate(mergeSession(get(), readAll()), id);
    applySession(get().userId, next, set);
    pushRemote(get().userId, next);
  },
  renameTemplate: (id, name) => {
    const next = renameTpl(mergeSession(get(), readAll()), id, name);
    applySession(get().userId, next, set);
    pushRemote(get().userId, next);
  },
  templateById: (id) => get().templates.find((item) => item.id === id),
  liveRows: (template, available) => applyTemplateRows(template.rows, available),
}));
