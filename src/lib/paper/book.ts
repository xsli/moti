import {
  COLLECTION_KINDS,
  sortCollectionsByOrder,
  type Collection,
} from "../problems/collections.ts";
import { sortBySourceOrder } from "../problems/order.ts";
import type { Problem } from "../problems/types";
import type { ExamItem } from "./layout";
import type { BlankLines } from "./space";

export interface BookChapter {
  id: string;
  title: string;
  problemIds: string[];
}

export function bookChapters(
  folder: string,
  collections: Collection[],
  problems: Problem[],
): BookChapter[] {
  const members = collections.filter((c) => c.groupName.trim() === folder.trim());
  const byCollection = new Map<string, Problem[]>();
  for (const p of problems) {
    if (!p.collectionId) continue;
    const list = byCollection.get(p.collectionId) ?? [];
    list.push(p);
    byCollection.set(p.collectionId, list);
  }
  return COLLECTION_KINDS.flatMap((kind) =>
    sortCollectionsByOrder(
      members.filter((c) => c.kind === kind),
      (c) => Math.max(0, ...(byCollection.get(c.id) ?? []).map((p) => p.createdAt)),
    ),
  ).flatMap((c) => {
    const ordered = sortBySourceOrder(byCollection.get(c.id) ?? []);
    return ordered.length
      ? [{ id: c.id, title: c.name, problemIds: ordered.map((p) => p.id) }]
      : [];
  });
}

// Keep the source order, including interleaved examples and exercises.
export function bookChapterItems(problems: Problem[], blankLines: BlankLines): ExamItem[] {
  let example = 0;
  let exercise = 0;
  return problems.map((problem, i) => {
    const isExample = problem.tags.includes("例题");
    const label = isExample ? `例${++example}.` : `${++exercise}.`;
    return {
      kind: "problem",
      problem,
      number: i + 1,
      blankLines,
      role: isExample ? "example" : "practice",
      label,
    };
  });
}

export const BOOK_TOC_PAGE_SIZE = 16;

export function selectBookChapters(chapters: BookChapter[], ids: string[]): BookChapter[] {
  if (!ids.length) throw new Error("请至少选择一个章节");
  if (new Set(ids).size !== ids.length) throw new Error("章节不能重复");
  const byId = new Map(chapters.map((c) => [c.id, c]));
  return ids.map((id) => {
    const chapter = byId.get(id);
    if (!chapter) throw new Error("所选章节已被移动、删除或清空，请重新打开导出窗口");
    return chapter;
  });
}

export function bookContents(chapters: BookChapter[], pageCounts: number[]) {
  if (
    chapters.length !== pageCounts.length ||
    pageCounts.some((n) => !Number.isInteger(n) || n < 1)
  ) {
    throw new Error("章节页数不完整，无法生成目录");
  }
  const frontPages = 1 + Math.ceil(chapters.length / BOOK_TOC_PAGE_SIZE);
  let page = frontPages + 1;
  return chapters.map((chapter, i) => {
    const entry = { ...chapter, page };
    page += pageCounts[i];
    return entry;
  });
}
