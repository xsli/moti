import assert from "node:assert/strict";
import test from "node:test";
import { coercePracticeHistory, matchesErrorFilter, practiceStats, practiceSummary, recordPractice, undoPractice } from "./review.ts";
import type { Problem } from "./types.ts";
const day = 86_400_000;
const old = { mastery: "new" as const, reviewCount: 9, nextReviewAt: 12, practiceHistory: undefined };
const fresh: Pick<Problem, "mastery" | "reviewCount" | "nextReviewAt" | "practiceHistory"> = {
  mastery: "unpracticed", reviewCount: 0, nextReviewAt: 12,
  practiceHistory: { version: 1, priorUnknown: false, entries: [] },
};

test("old mastery and success counters never become invented errors or a new streak", () => {
  assert.equal(coercePracticeHistory(undefined), undefined);
  assert.equal(practiceSummary(old), "历史次数未记录");
  assert.equal(matchesErrorFilter(old, "repeated"), false);
  const next = recordPractice(old, "correct", "a", day, "unknown");
  assert.equal(next.mastery, "reviewing");
  assert.equal(next.reviewCount, 1);
  assert.equal(next.practiceHistory?.priorUnknown, true);
  assert.match(practiceSummary(next), /更早次数未知/);
});

test("wrong and hinted attempts both count for mistake filters while retaining their outcomes", () => {
  const once = recordPractice(fresh, "wrong", "a", day, "calc");
  const twice = recordPractice(once, "wrong", "b", day + 1, "concept");
  assert.equal(twice.mastery, "reviewing");
  assert.match(practiceSummary(twice), /累计错 2 次 · 连续错 2 次/);
  assert.equal(matchesErrorFilter(twice, "repeated"), true);
  const hinted = recordPractice(twice, "hinted", "c", day + 2, "unknown");
  assert.equal(practiceStats(hinted).wrong, 3);
  assert.equal(practiceStats(hinted).streak, 0);
  assert.equal(practiceStats(hinted).consecutiveWrong, 3);
  assert.equal(hinted.practiceHistory?.entries.at(-1)?.outcome, "hinted");
  assert.equal(matchesErrorFilter({ ...twice, mastery: "mastered" } as Problem, "repeated"), true);
});

test("existing hinted history is filterable, repeated hints count, undo removes the last count", () => {
  const once = recordPractice(old, "hinted", "hint-1", day, "method");
  const restored = { ...once, practiceHistory: coercePracticeHistory(JSON.parse(JSON.stringify(once.practiceHistory))) };
  assert.equal(matchesErrorFilter(restored, "wrong"), true);
  assert.equal(matchesErrorFilter(restored, "repeated"), false);
  assert.equal(practiceStats(restored).priorUnknown, true);
  const twice = recordPractice(restored, "hinted", "hint-2", day + 1, "method");
  assert.equal(matchesErrorFilter(twice, "repeated"), true);
  const corrected = recordPractice(twice, "correct", "pass", day + 2, "unknown");
  assert.equal(practiceStats(corrected).wrong, 2);
  assert.equal(practiceStats(corrected).consecutiveWrong, 0);
  assert.equal(matchesErrorFilter(undoPractice(twice, "hint-2"), "repeated"), false);
});

test("three spaced successes establish mastery but repeated same-day clicks do not", () => {
  let state = recordPractice(fresh, "correct", "a", day, "unknown");
  state = recordPractice(state, "correct", "b", day + 1, "unknown");
  state = recordPractice(state, "correct", "c", day + 2, "unknown");
  assert.equal(state.reviewCount, 1);
  assert.equal(state.mastery, "reviewing");
  state = recordPractice(state, "correct", "d", 2 * day, "unknown");
  state = recordPractice(state, "correct", "e", 3 * day, "unknown");
  assert.equal(state.mastery, "mastered");
  assert.equal(state.reviewCount, 3);
  const failed = recordPractice(state, "wrong", "f", 4 * day, "method");
  assert.equal(failed.reviewCount, 0);
  assert.equal(failed.mastery, "reviewing");
  assert.equal(recordPractice(failed, "correct", "g", 5 * day, "unknown").mastery, "reviewing");
});

test("idempotent event IDs and undo preserve history, counters and prior legacy state", () => {
  const first = recordPractice(old, "wrong", "a", day, "calc");
  assert.deepEqual(recordPractice(first, "wrong", "a", day + 1, "calc"), first);
  const second = recordPractice(first, "wrong", "b", day + 2, "calc");
  assert.throws(() => undoPractice(second, "a"), /最近一次/);
  assert.deepEqual(undoPractice(second, "b"), first);
  const undone = undoPractice(first, "a");
  assert.equal(undone.mastery, "unpracticed");
  assert.equal(undone.reviewCount, 9);
  assert.equal(practiceSummary(undone), "历史次数未记录");
  assert.throws(() => undoPractice({ ...first, mastery: "mastered" }, "a"), /手动修改/);
});

test("practice history JSON roundtrips and malformed or duplicate records are rejected", () => {
  const recorded = recordPractice(fresh, "wrong", "a", day, "calc");
  const json = JSON.parse(JSON.stringify(recorded.practiceHistory));
  assert.deepEqual(coercePracticeHistory(json), recorded.practiceHistory);
  assert.throws(() => coercePracticeHistory({ ...json, entries: [...json.entries, ...json.entries] }));
  assert.throws(() => coercePracticeHistory({ ...json, entries: [{ ...json.entries[0], at: -1 }] }));
  assert.throws(() => coercePracticeHistory({ ...json, priorUnknown: undefined }));
});
