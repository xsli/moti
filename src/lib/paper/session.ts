import { coerceBlankAuto, coerceBlankLines, DEFAULT_BLANK_LINES, type BlankLines } from "./space.ts";
import type { PaperRow, SheetKind } from "./layout";

export type PaperTemplate = {
  id: string;
  name: string;
  title: string;
  withAnswers: boolean;
  blankLines: BlankLines;
  blankAuto: boolean;
  sheetKind: SheetKind;
  rows: PaperRow[];
  createdAt: number;
  updatedAt: number;
};

export type PaperSession = {
  basket: string[];
  templates: PaperTemplate[];
};

const BASKET_MAX = 80;
const TEMPLATE_MAX = 20;

export function emptySession(): PaperSession {
  return { basket: [], templates: [] };
}

function asHeading(row: Record<string, unknown>, id: string): PaperRow | null {
  const title = String(row.title ?? "").slice(0, 40);
  const perScore = Math.max(0, Math.round(Number(row.perScore) || 0));
  if (!title) return null;
  const heading: Extract<PaperRow, { kind: "heading" }> = {
    kind: "heading",
    id,
    title,
    perScore,
  };
  if (row.blankLines != null && row.blankLines !== "") {
    heading.blankLines = coerceBlankLines(row.blankLines);
  }
  return heading;
}

function asProblem(row: Record<string, unknown>, id: string): PaperRow | null {
  const problemId = String(row.problemId ?? "").slice(0, 80);
  if (!problemId) return null;
  return { kind: "problem", id, problemId };
}

export function coerceRows(raw: unknown): PaperRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: PaperRow[] = [];
  for (const item of raw) {
    const row = (item ?? {}) as Record<string, unknown>;
    const id = String(row.id ?? "").slice(0, 80) || crypto.randomUUID();
    const next = row.kind === "heading" ? asHeading(row, id) : asProblem(row, id);
    if (next) rows.push(next);
  }
  return rows.slice(0, 120);
}

export function parseSession(raw: unknown): PaperSession {
  const data = (raw ?? {}) as Record<string, unknown>;
  const basket = Array.isArray(data.basket)
    ? [...new Set(data.basket.map((id) => String(id).slice(0, 80)).filter(Boolean))].slice(0, BASKET_MAX)
    : [];
  const templates: PaperTemplate[] = [];
  if (Array.isArray(data.templates)) {
    for (const item of data.templates) {
      const row = (item ?? {}) as Record<string, unknown>;
      const id = String(row.id ?? "").slice(0, 80);
      const name = String(row.name ?? "").trim().slice(0, 40);
      if (!id || !name) continue;
      templates.push({
        id,
        name,
        title: String(row.title ?? "错题练习卷").slice(0, 40) || "错题练习卷",
        withAnswers: Boolean(row.withAnswers),
        blankLines: coerceBlankLines(row.blankLines),
        blankAuto: coerceBlankAuto(row.blankAuto, row.blankLines),
        sheetKind: row.sheetKind === "handout" ? "handout" : "exam",
        rows: coerceRows(row.rows),
        createdAt: Number(row.createdAt) || Date.now(),
        updatedAt: Number(row.updatedAt) || Date.now(),
      });
    }
  }
  return { basket, templates: templates.slice(0, TEMPLATE_MAX) };
}

export function addToBasket(session: PaperSession, ids: string[]): PaperSession {
  const basket = [...session.basket];
  for (const raw of ids) {
    const id = raw.slice(0, 80);
    if (!id || basket.includes(id) || basket.length >= BASKET_MAX) continue;
    basket.push(id);
  }
  return { ...session, basket };
}

export function removeFromBasket(session: PaperSession, id: string): PaperSession {
  return { ...session, basket: session.basket.filter((item) => item !== id) };
}

export function clearBasket(session: PaperSession): PaperSession {
  return { ...session, basket: [] };
}

export function idsFromRows(rows: PaperRow[]): string[] {
  return rows.filter((row): row is Extract<PaperRow, { kind: "problem" }> => row.kind === "problem").map((row) => row.problemId);
}

export function applyTemplateRows(rows: PaperRow[], available: Set<string>): PaperRow[] {
  return rows.filter((row) => row.kind === "heading" || available.has(row.problemId));
}

function problemRow(problemId: string): PaperRow {
  return { kind: "problem", id: crypto.randomUUID(), problemId };
}

function copyHeading(row: Extract<PaperRow, { kind: "heading" }>): PaperRow {
  return {
    kind: "heading",
    id: crypto.randomUUID(),
    title: row.title,
    perScore: row.perScore,
    blankLines: row.blankLines,
  };
}

/** Apply a template's headings/scores onto a new set of problems, keeping section sizes. */
export function applyLayoutToIds(rows: PaperRow[], problemIds: string[]): PaperRow[] {
  const ids = [...new Set(problemIds.map((id) => id.slice(0, 80)).filter(Boolean))];
  const sections: { heading: Extract<PaperRow, { kind: "heading" }> | null; slots: number }[] = [];
  let current: { heading: Extract<PaperRow, { kind: "heading" }> | null; slots: number } = {
    heading: null,
    slots: 0,
  };
  let seen = false;
  for (const row of rows) {
    if (row.kind === "heading") {
      if (seen) sections.push(current);
      current = { heading: row, slots: 0 };
      seen = true;
    } else {
      current.slots += 1;
      seen = true;
    }
  }
  if (seen) sections.push(current);
  const named = sections.filter((section) => section.heading);
  if (!named.length) return ids.map((id) => problemRow(id));

  const out: PaperRow[] = [];
  let rest = [...ids];
  const lead = sections[0]?.heading ? 0 : (sections[0]?.slots ?? 0);
  if (lead > 0) {
    out.push(...rest.splice(0, lead).map(problemRow));
  }
  const slotSum = named.reduce((sum, section) => sum + section.slots, 0);
  named.forEach((section, index) => {
    if (section.heading) out.push(copyHeading(section.heading));
    const last = index === named.length - 1;
    let take = last ? rest.length : section.slots;
    if (slotSum === 0) {
      const left = named.length - index;
      take = last ? rest.length : Math.ceil(rest.length / left);
    }
    out.push(...rest.splice(0, take).map(problemRow));
  });
  out.push(...rest.map(problemRow));
  return out;
}

export function saveTemplate(
  session: PaperSession,
  input: {
    name: string;
    title: string;
    withAnswers: boolean;
    blankLines?: BlankLines;
    blankAuto?: boolean;
    sheetKind?: SheetKind;
    rows: PaperRow[];
    id?: string;
  },
): PaperSession {
  const now = Date.now();
  const name = input.name.trim().slice(0, 40) || input.title.trim().slice(0, 40) || "未命名试卷";
  const payload: PaperTemplate = {
    id: input.id ?? crypto.randomUUID(),
    name,
    title: input.title.trim().slice(0, 40) || "错题练习卷",
    withAnswers: input.withAnswers,
    blankLines: coerceBlankLines(input.blankLines ?? DEFAULT_BLANK_LINES),
    blankAuto: Boolean(input.blankAuto),
    sheetKind: input.sheetKind === "handout" ? "handout" : "exam",
    rows: coerceRows(input.rows),
    createdAt: now,
    updatedAt: now,
  };
  const existing = session.templates.findIndex((item) => item.id === payload.id);
  const templates =
    existing >= 0
      ? session.templates.map((item, i) => (i === existing ? { ...payload, createdAt: item.createdAt } : item))
      : [payload, ...session.templates].slice(0, TEMPLATE_MAX);
  return { ...session, templates };
}

export function deleteTemplate(session: PaperSession, id: string): PaperSession {
  return { ...session, templates: session.templates.filter((item) => item.id !== id) };
}

export function renameTemplate(session: PaperSession, id: string, name: string): PaperSession {
  const next = name.trim().slice(0, 40);
  if (!next) return session;
  return {
    ...session,
    templates: session.templates.map((item) => (item.id === id ? { ...item, name: next, updatedAt: Date.now() } : item)),
  };
}
