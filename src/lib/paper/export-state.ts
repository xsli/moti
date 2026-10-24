import type { ExamItem, SheetKind } from "./layout";
import type { BlankLines } from "./space";
import { coerceAnswerPlacement, type AnswerPlacement } from "./answer-placement.ts";

export interface PaperExportInput {
  items: ExamItem[];
  title: string;
  groupName?: string;
  dateLabel: string;
  withAnswers: boolean;
  answerPlacement?: AnswerPlacement;
  blankLines: BlankLines;
  blankAuto: boolean;
  sheetKind: SheetKind;
  template?: "general" | "gaokao";
  examMinutes?: number;
  solutionSpaceCm?: number;
}

// Cache synchronization replaces records even when their printed content is unchanged.
// Compare only export inputs, without serializing large original-image payloads.
export function samePaperExport(a: PaperExportInput | null, b: PaperExportInput): boolean {
  if (!a) return false;
  if (a === b) return true;
  if (
    a.title !== b.title || a.groupName !== b.groupName || a.dateLabel !== b.dateLabel || a.withAnswers !== b.withAnswers ||
    a.blankLines !== b.blankLines || a.blankAuto !== b.blankAuto || a.sheetKind !== b.sheetKind ||
    a.items.length !== b.items.length || a.template !== b.template ||
    a.examMinutes !== b.examMinutes || a.solutionSpaceCm !== b.solutionSpaceCm
  ) return false;
  if (a.sheetKind === "handout" && a.withAnswers &&
    coerceAnswerPlacement(a.answerPlacement) !== coerceAnswerPlacement(b.answerPlacement)) return false;

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
    if (a.template === "gaokao" && (item.points !== other.points || p.notes !== q.notes ||
      p.title !== q.title || p.tags.join("\0") !== q.tags.join("\0"))) return false;
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
      return figure.id === next.id && figure.subproblem === next.subproblem &&
        figure.inline === next.inline &&
        (figure.image || "") === (next.image || "") &&
        (figure.image || figure.svg || "") === (next.image || next.svg || "");
    });
  });
}
