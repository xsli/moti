import type { Problem } from "@/lib/problems/types";

export const BLANK_LINE_OPTIONS = [2, 3, 4, 5, 6, 8] as const;
export type BlankLines = (typeof BLANK_LINE_OPTIONS)[number];

export const DEFAULT_BLANK_LINES: BlankLines = 5;

export function coerceBlankLines(value: unknown): BlankLines {
  const n = Math.round(Number(value));
  if (n === 0) return DEFAULT_BLANK_LINES;
  return (BLANK_LINE_OPTIONS as readonly number[]).includes(n) ? (n as BlankLines) : DEFAULT_BLANK_LINES;
}

export function coerceBlankAuto(value: unknown, blankLinesRaw?: unknown): boolean {
  if (typeof value === "boolean") return value;
  return Math.round(Number(blankLinesRaw)) === 0;
}

export function blankLineLabel(lines: BlankLines): string {
  return `${lines} 行`;
}

export function hasWrittenAnswer(problem: Problem): boolean {
  return Boolean(problem.correctAnswer?.trim() || problem.analysis?.trim());
}

function answerPlain(raw: string) {
  return raw
    .replace(/\$\$[\s\S]*?\$\$/g, "公式")
    .replace(/\$[^$]+\$/g, "式")
    .replace(/\s+/g, " ")
    .trim();
}

export function answerHeightMm(problem: Problem): number {
  const raw = `${problem.correctAnswer ?? ""}\n${problem.analysis ?? ""}`;
  const plain = answerPlain(raw);
  const paras = raw.split(/\n+/).filter((line) => line.trim()).length;
  const displays = Math.floor((raw.match(/\$\$/g) ?? []).length / 2);
  const choice = /^[A-Da-d甲乙丙丁]$/.test(plain);
  const number = /^[+-]?\d+(\.\d+)?$/.test(plain);

  if (choice || number || (plain.length <= 10 && paras <= 1 && displays === 0)) return 8;
  if (plain.length <= 28 && paras <= 1 && displays <= 1) return 14;
  if (plain.length <= 80 && paras <= 4) return 24;
  if (plain.length <= 160) return 36;
  return 48;
}

export function blankHeightMm(problem: Problem, lines: BlankLines, auto = false): number {
  if (auto && hasWrittenAnswer(problem)) return answerHeightMm(problem);
  return Math.round(lines * 7);
}

export function blankHeightCm(problem: Problem, lines: BlankLines, auto = false): string {
  return `${(blankHeightMm(problem, lines, auto) / 10).toFixed(1)}cm`;
}

export function answerHeightCm(problem: Problem): string {
  return `${(answerHeightMm(problem) / 10).toFixed(1)}cm`;
}
