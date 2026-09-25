import type { Collection } from "./collections";
import type { Problem } from "./types";

export function folderSummaries(
  collections: Pick<Collection, "id" | "groupName">[],
  problems: Pick<Problem, "collectionId" | "mastery" | "nextReviewAt">[],
  now = Date.now(),
) {
  const folders = new Map<string, { name: string; groups: number; total: number; due: number; mastered: number }>();
  const owners = new Map<string, string>();
  for (const collection of collections) {
    const name = collection.groupName.trim();
    const summary = folders.get(name) ?? { name, groups: 0, total: 0, due: 0, mastered: 0 };
    summary.groups += 1;
    folders.set(name, summary);
    owners.set(collection.id, name);
  }
  for (const problem of problems) {
    if (!problem.collectionId) continue;
    const name = owners.get(problem.collectionId);
    if (name === undefined) continue;
    const summary = folders.get(name)!;
    summary.total += 1;
    if (problem.mastery === "mastered") summary.mastered += 1;
    else if (problem.nextReviewAt <= now) summary.due += 1;
  }
  return [...folders.values()].sort((a, b) => {
    if (!a.name) return b.name ? 1 : 0;
    if (!b.name) return -1;
    return a.name.localeCompare(b.name, "zh");
  });
}
