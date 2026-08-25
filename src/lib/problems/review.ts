import type { Mastery } from "./types";

export function nextReview(
  _mastery: Mastery,
  remembered: boolean,
  reviewCount: number,
): { mastery: Mastery; nextReviewAt: number; reviewCount: number } {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (!remembered) {
    return { mastery: "reviewing", nextReviewAt: now, reviewCount };
  }
  const count = reviewCount + 1;
  if (count >= 3) {
    return { mastery: "mastered", nextReviewAt: now + 14 * day, reviewCount: count };
  }
  const delay = count === 1 ? 1 * day : 3 * day;
  return { mastery: "reviewing", nextReviewAt: now + delay, reviewCount: count };
}
