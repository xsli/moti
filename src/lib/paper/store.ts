import { create } from "zustand";
import type { PaperRow } from "./layout";
import type { BlankLines } from "./space";
import {
  addToBasket as addIds,
  applyTemplateRows,
  clearBasket as emptyBasket,
  deleteTemplate as dropTemplate,
  emptySession,
  parseSession,
  removeFromBasket as dropId,
  renameTemplate as renameTpl,
  saveTemplate as putTemplate,
  type PaperSession,
  type PaperTemplate,
} from "./session";

const PREFIX = "moti-paper-v1:";

function keyFor(userId: string) {
  return `${PREFIX}${userId || "guest"}`;
}

function read(userId: string): PaperSession {
  if (typeof window === "undefined") return emptySession();
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return emptySession();
    return parseSession(JSON.parse(raw) as unknown);
  } catch {
    return emptySession();
  }
}

function write(userId: string, session: PaperSession) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(session));
  } catch {
    /* quota */
  }
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
    rows: PaperRow[];
    id?: string;
  }) => string;
  deleteTemplate: (id: string) => void;
  renameTemplate: (id: string, name: string) => void;
  templateById: (id: string) => PaperTemplate | undefined;
  liveRows: (template: PaperTemplate, available: Set<string>) => PaperRow[];
}

export const usePaperStore = create<PaperState>()((set, get) => ({
  userId: "guest",
  basket: [],
  templates: [],
  hydrate: (userId) => {
    const id = userId || "guest";
    set({ userId: id, ...read(id) });
  },
  addToBasket: (ids) => {
    const prev = get().basket.length;
    const next = addIds(get(), ids);
    write(get().userId, next);
    set({ basket: next.basket });
    return next.basket.length - prev;
  },
  removeFromBasket: (id) => {
    const next = dropId(get(), id);
    write(get().userId, next);
    set({ basket: next.basket });
  },
  clearBasket: () => {
    const next = emptyBasket(get());
    write(get().userId, next);
    set({ basket: next.basket });
  },
  saveTemplate: (input) => {
    const id = input.id ?? crypto.randomUUID();
    const next = putTemplate(get(), { ...input, id });
    write(get().userId, next);
    set({ templates: next.templates });
    return id;
  },
  deleteTemplate: (id) => {
    const next = dropTemplate(get(), id);
    write(get().userId, next);
    set({ templates: next.templates });
  },
  renameTemplate: (id, name) => {
    const next = renameTpl(get(), id, name);
    write(get().userId, next);
    set({ templates: next.templates });
  },
  templateById: (id) => get().templates.find((item) => item.id === id),
  liveRows: (template, available) => applyTemplateRows(template.rows, available),
}));
