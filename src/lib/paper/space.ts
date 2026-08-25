import type { Problem } from "@/lib/problems/types";

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

export function answerHeightCm(problem: Problem): string {
  return `${(answerHeightMm(problem) / 10).toFixed(1)}cm`;
}
