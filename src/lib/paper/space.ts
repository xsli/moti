import type { Problem } from "@/lib/problems/types";

export function answerHeightMm(problem: Problem): number {
  const source = `${problem.correctAnswer ?? ""}\n${problem.analysis ?? ""}`
    .replace(/\$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const lines = Math.max(2, Math.ceil(Math.max(source.length, 12) / 20));
  return Math.min(88, Math.max(16, lines * 7));
}

export function answerHeightCm(problem: Problem): string {
  return `${(answerHeightMm(problem) / 10).toFixed(1)}cm`;
}
