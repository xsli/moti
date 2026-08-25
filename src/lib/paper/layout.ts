import type { Problem } from "@/lib/problems/types";

export type PaperRow =
  | { kind: "heading"; id: string; title: string; perScore: number }
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

export function sectionCount(rows: PaperRow[], headingIndex: number): number {
  let count = 0;
  for (let i = headingIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.kind === "heading") break;
    count += 1;
  }
  return count;
}

export function paperTotal(rows: PaperRow[]): number {
  return rows.reduce((sum, row, index) => {
    if (row.kind !== "heading") return sum;
    return sum + sectionCount(rows, index) * (row.perScore || 0);
  }, 0);
}

export function headingLabel(n: number, title: string, count: number, perScore: number): string {
  const name = title.trim() || "大题";
  if (count <= 0) return `${chineseOrdinal(n)}、${name}`;
  if (perScore > 0) {
    return `${chineseOrdinal(n)}、${name}（本题共${count}小题，每题${perScore}分，满分${count * perScore}分）`;
  }
  return `${chineseOrdinal(n)}、${name}（本题共${count}小题）`;
}

export function rowsFromIds(ids: string[]): PaperRow[] {
  return ids.map((problemId) => ({ kind: "problem" as const, id: problemId, problemId }));
}

export function resolveExamItems(rows: PaperRow[], problems: Problem[]): ExamItem[] {
  const byId = new Map(problems.map((p) => [p.id, p]));
  const items: ExamItem[] = [];
  let number = 0;
  let heading = 0;
  rows.forEach((row, index) => {
    if (row.kind === "heading") {
      const title = row.title.trim();
      if (!title) return;
      heading += 1;
      items.push({
        kind: "heading",
        title: headingLabel(heading, title, sectionCount(rows, index), row.perScore || 0),
      });
      return;
    }
    const problem = byId.get(row.problemId);
    if (!problem) return;
    number += 1;
    items.push({ kind: "problem", problem, number });
  });
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
