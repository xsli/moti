import { ERROR_REASONS, MASTERY_VALUES, type PracticeHistory, type PracticeOutcome, type Problem } from "./types.ts";

export const OUTCOME_LABEL: Record<PracticeOutcome, string> = {
  correct: "独立做对", wrong: "做错了", hinted: "看提示才会",
};
const DAY = 86_400_000;
type PracticeState = Pick<Problem, "mastery" | "reviewCount" | "nextReviewAt" | "practiceHistory">;

// Missing old records are unknown, never inferred from mastery or reviewCount.
export function coercePracticeHistory(raw: unknown): PracticeHistory | undefined {
  if (raw == null) return undefined;
  const h = raw as PracticeHistory;
  if (h.version !== 1 || typeof h.priorUnknown !== "boolean" || !Array.isArray(h.entries)) throw new Error("练习记录格式不对");
  const ids = new Set<string>();
  let previousAt = 0;
  const entries = h.entries.map(e => {
    if (!e || typeof e.id !== "string" || !e.id || e.id.length > 80 || ids.has(e.id) ||
      !Number.isSafeInteger(e.at) || e.at < previousAt || !["correct", "wrong", "hinted"].includes(e.outcome) ||
      !ERROR_REASONS.includes(e.errorReason) || !e.before || !(e.before.mastery === "new" || MASTERY_VALUES.includes(e.before.mastery)) ||
      !Number.isSafeInteger(e.before.reviewCount) || e.before.reviewCount < 0 ||
      !Number.isFinite(e.before.nextReviewAt) || e.before.nextReviewAt < 0) throw new Error("练习记录格式不对");
    ids.add(e.id); previousAt = e.at;
    return { id: e.id, at: e.at, outcome: e.outcome, errorReason: e.errorReason, before: { ...e.before } };
  });
  return { version: 1, priorUnknown: h.priorUnknown, entries };
}

export function practiceStats(problem: Pick<Problem, "practiceHistory">) {
  const history = problem.practiceHistory;
  const entries = history?.entries ?? [];
  let wrong = 0, consecutiveWrong = 0, streak = 0, countedAt = 0;
  for (const entry of entries) {
    // Both incorrect and assisted attempts belong to the mistake-review pool.
    // Keep the original outcome in history so the two remain distinguishable.
    if (entry.outcome !== "correct") wrong++;
    consecutiveWrong = entry.outcome !== "correct" ? consecutiveWrong + 1 : 0;
    if (entry.outcome !== "correct") { streak = 0; countedAt = 0; }
    else if (!streak || entry.at - countedAt >= DAY) { streak++; countedAt = entry.at; }
  }
  return { wrong, consecutiveWrong, streak, countedAt, priorUnknown: !history || history.priorUnknown };
}

export function practiceSummary(problem: Pick<Problem, "practiceHistory">): string {
  const s = practiceStats(problem);
  if (!problem.practiceHistory?.entries.length && s.priorUnknown) return "历史次数未记录";
  return `${s.priorUnknown ? "已记录" : "累计"}错 ${s.wrong} 次${s.consecutiveWrong > 1 ? ` · 连续错 ${s.consecutiveWrong} 次` : ""}${s.priorUnknown ? " · 更早次数未知" : ""}`;
}

export type ErrorFilter = "all" | "wrong" | "repeated" | "unknown";
export function matchesErrorFilter(problem: Pick<Problem, "practiceHistory">, filter: ErrorFilter) {
  const s = practiceStats(problem);
  return filter === "all" || (filter === "wrong" && s.wrong > 0) ||
    (filter === "repeated" && s.wrong >= 2) || (filter === "unknown" && s.priorUnknown);
}

export function recordPractice(problem: PracticeState, outcome: PracticeOutcome, id: string, now: number, errorReason: Problem["errorReason"]): PracticeState {
  const history = problem.practiceHistory ?? { version: 1 as const, priorUnknown: true, entries: [] };
  if (history.entries.some(entry => entry.id === id)) return problem;
  const entry = { id, at: Math.max(now, history.entries.at(-1)?.at ?? 0), outcome, errorReason,
    before: { mastery: problem.mastery, reviewCount: problem.reviewCount, nextReviewAt: problem.nextReviewAt } };
  const practiceHistory = { ...history, entries: [...history.entries, entry] };
  const stats = practiceStats({ practiceHistory });
  const mastery = outcome === "correct" && stats.streak >= 3 ? "mastered" : "reviewing";
  const delay = stats.streak >= 3 ? 14 * DAY : stats.streak >= 2 ? 3 * DAY : DAY;
  return { practiceHistory, mastery, reviewCount: stats.streak,
    nextReviewAt: outcome !== "correct" ? now : stats.countedAt + delay };
}

export function undoPractice(problem: PracticeState, entryId: string): PracticeState {
  const history = problem.practiceHistory;
  const last = history?.entries.at(-1);
  if (!history || !last || last.id !== entryId) throw new Error("记录已变化，只能撤销最近一次练习");
  if (problem.mastery !== (last.outcome === "correct" && practiceStats(problem).streak >= 3 ? "mastered" : "reviewing")) {
    throw new Error("当前状态已手动修改，请先核对记录再撤销");
  }
  return { ...last.before, mastery: last.before.mastery === "new" ? "unpracticed" : last.before.mastery,
    practiceHistory: { ...history, entries: history.entries.slice(0, -1) } };
}
