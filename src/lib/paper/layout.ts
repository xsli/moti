import type { Problem } from "@/lib/problems/types";

export type PaperRow =
  | { kind: "heading"; id: string; title: string }
  | { kind: "problem"; id: string; problemId: string };

export type ExamItem =
  | { kind: "heading"; title: string }
  | { kind: "problem"; problem: Problem; number: number };

const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

export function chineseOrdinal(n: number): string {
  if (n <= 10) return CN[n] ?? String(n);
  if (n < 20) return `十${n === 10 ? "" : CN[n - 10]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${CN[tens]}十${ones ? CN[ones] : ""}`;
  }
  return String(n);
}

export function headingLabel(n: number, title: string): string {
  const name = title.trim();
  return name ? `${chineseOrdinal(n)}、${name}` : `${chineseOrdinal(n)}、`;
}

export function rowsFromIds(ids: string[]): PaperRow[] {
  return ids.map((problemId) => ({ kind: "problem" as const, id: problemId, problemId }));
}

export function resolveExamItems(rows: PaperRow[], problems: Problem[]): ExamItem[] {
  const byId = new Map(problems.map((p) => [p.id, p]));
  const items: ExamItem[] = [];
  let number = 0;
  let heading = 0;
  for (const row of rows) {
    if (row.kind === "heading") {
      const title = row.title.trim();
      if (!title) continue;
      heading += 1;
      items.push({ kind: "heading", title: headingLabel(heading, title) });
      continue;
    }
    const problem = byId.get(row.problemId);
    if (!problem) continue;
    number += 1;
    items.push({ kind: "problem", problem, number });
  }
  return items;
}

export function reorderRows(rows: PaperRow[], from: number, to: number): PaperRow[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to > rows.length) return rows;
  const copy = [...rows];
  const [item] = copy.splice(from, 1);
  const dest = from < to ? to - 1 : to;
  copy.splice(dest, 0, item);
  return copy;
}
