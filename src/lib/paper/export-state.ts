import type { ExamItem, SheetKind } from "./layout";
import type { BlankLines } from "./space";

export interface PaperExportInput {
  items: ExamItem[];
  title: string;
  groupName?: string;
  dateLabel: string;
  withAnswers: boolean;
  blankLines: BlankLines;
  blankAuto: boolean;
  sheetKind: SheetKind;
}

// Cache synchronization replaces records even when their printed content is unchanged.
// Compare only export inputs, without serializing large original-image payloads.
export function samePaperExport(a: PaperExportInput | null, b: PaperExportInput): boolean {
  if (!a) return false;
  if (a === b) return true;
  if (
    a.title !== b.title || a.groupName !== b.groupName || a.dateLabel !== b.dateLabel || a.withAnswers !== b.withAnswers ||
    a.blankLines !== b.blankLines || a.blankAuto !== b.blankAuto || a.sheetKind !== b.sheetKind ||
    a.items.length !== b.items.length
  ) return false;

  return a.items.every((item, index) => {
    const other = b.items[index];
    if (item === other) return true;
    if (item.kind === "heading" || other.kind === "heading") {
      return item.kind === "heading" && other.kind === "heading" &&
        item.title === other.title && item.role === other.role;
    }
    if (item.number !== other.number || item.label !== other.label ||
      item.role !== other.role || item.blankLines !== other.blankLines) return false;

    const p = item.problem;
    const q = other.problem;
    if (p.id !== q.id) return false;
    if (a.sheetKind === "handout" && p.tags.includes("例题") !== q.tags.includes("例题")) return false;
    if ((a.withAnswers || a.blankAuto) &&
      (p.correctAnswer !== q.correctAnswer || p.analysis !== q.analysis)) return false;
    if (a.sheetKind === "handout" && item.role === "points") {
      return (p.notes.trim() || p.title) === (q.notes.trim() || q.title);
    }
    if (p.stem !== q.stem) return false;
    if (p.figures.length !== q.figures.length) return false;
    return p.figures.every((figure, i) => {
      const next = q.figures[i];
      return figure.subproblem === next.subproblem &&
        (figure.image || "") === (next.image || "") &&
        (figure.image || figure.svg || "") === (next.image || next.svg || "");
    });
  });
}
