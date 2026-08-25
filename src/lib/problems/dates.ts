export function startOfLocalDay(ts = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatLoggedDate(ts: number): string {
  const key = dayKey(ts);
  const today = dayKey(Date.now());
  const yesterday = dayKey(Date.now() - 24 * 60 * 60 * 1000);
  if (key === today) return "今天";
  if (key === yesterday) return "昨天";
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatLoggedDateLong(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export type DateFilter = "all" | "today" | "7d" | "30d" | "day";

export function matchesDateFilter(createdAt: number, filter: DateFilter, day?: string): boolean {
  if (filter === "all") return true;
  const start = startOfLocalDay(createdAt);
  const today = startOfLocalDay();
  if (filter === "today") return start === today;
  if (filter === "7d") return start >= today - 6 * 24 * 60 * 60 * 1000;
  if (filter === "30d") return start >= today - 29 * 24 * 60 * 60 * 1000;
  if (filter === "day") return Boolean(day) && dayKey(createdAt) === day;
  return true;
}
