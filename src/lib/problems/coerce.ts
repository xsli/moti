import { sanitizeSvg } from "./svg";
import { coerceSubject, isErrorReason, type Figure, type Problem } from "./types";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asFigures(value: unknown): Figure[] {
  if (!Array.isArray(value)) return [];
  const figures: Figure[] = [];
  for (const item of value) {
    const fig = (item ?? {}) as Record<string, unknown>;
    const svgRaw = typeof fig.svg === "string" ? sanitizeSvg(fig.svg) : null;
    const image =
      typeof fig.image === "string" && fig.image.startsWith("data:image/")
        ? fig.image.slice(0, 16_000_000)
        : undefined;
    if (!svgRaw && !image) continue;
    figures.push({
      id: asString(fig.id, crypto.randomUUID()).slice(0, 80),
      title: asString(fig.title, "图形").slice(0, 80),
      svg: (svgRaw ?? "").slice(0, 200_000),
      caption: asString(fig.caption).slice(0, 200),
      image,
      subproblem: (() => {
        const n = Math.round(asNumber(fig.subproblem));
        return n > 0 && n <= 99 ? n : undefined;
      })(),
    });
  }
  return figures.slice(0, 8);
}

export function coerceProblem(raw: unknown): Problem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = asString(item.id).slice(0, 80);
  const title = asString(item.title).slice(0, 80);
  if (!id || !title) return null;

  const sourceKind =
    item.sourceKind === "photo" || item.sourceKind === "text" || item.sourceKind === "sample"
      ? item.sourceKind
      : "text";
  const difficulty = Math.min(5, Math.max(1, Math.round(asNumber(item.difficulty, 3)))) as
    | 1
    | 2
    | 3
    | 4
    | 5;
  const mastery =
    item.mastery === "reviewing" || item.mastery === "mastered" ? item.mastery : "new";
  const errorReason = isErrorReason(asString(item.errorReason, "unknown"))
    ? (item.errorReason as Problem["errorReason"])
    : "unknown";
  const sourceImage = asString(item.sourceImage);
  const tags = Array.isArray(item.tags)
    ? item.tags.map((t) => String(t).slice(0, 16)).filter(Boolean).slice(0, 8)
    : [];

  return {
    id,
    createdAt: asNumber(item.createdAt, Date.now()),
    updatedAt: asNumber(item.updatedAt, Date.now()),
    sourceKind,
    sourceImage: sourceImage && sourceImage.length <= 16_000_000 ? sourceImage : undefined,
    title: title || "未命名题目",
    stem: asString(item.stem).slice(0, 8000),
    figures: asFigures(item.figures),
    subject: coerceSubject(asString(item.subject, "other")),
    tags,
    difficulty,
    myAnswer: asString(item.myAnswer).slice(0, 2000),
    correctAnswer: asString(item.correctAnswer).slice(0, 2000),
    analysis: asString(item.analysis).slice(0, 8000),
    notes: asString(item.notes).slice(0, 4000),
    errorReason,
    mastery,
    reviewCount: Math.min(999, Math.max(0, Math.round(asNumber(item.reviewCount)))),
    nextReviewAt: asNumber(item.nextReviewAt, Date.now()),
    collectionId: asString(item.collectionId).slice(0, 80) || undefined,
    sourceBatchId: asString(item.sourceBatchId).slice(0, 80) || undefined,
    sourceOrder: (() => {
      const n = Math.round(asNumber(item.sourceOrder, 0));
      return n > 0 ? n : undefined;
    })(),
  };
}

export function coerceProblemList(raw: unknown, max = 400): Problem[] {
  if (!Array.isArray(raw)) return [];
  const out: Problem[] = [];
  for (const item of raw) {
    const problem = coerceProblem(item);
    if (problem) out.push(problem);
  }
  return out.slice(0, max);
}

export function mergeProblems(primary: Problem[], secondary: Problem[]): Problem[] {
  const map = new Map<string, Problem>();
  const take = (item: Problem) => {
    const current = map.get(item.id);
    if (!current) {
      map.set(item.id, item);
      return;
    }
    const newer = item.updatedAt > current.updatedAt ? item : current;
    const older = newer === item ? current : item;
    map.set(item.id, {
      ...newer,
      sourceImage: newer.sourceImage || older.sourceImage,
      collectionId: newer.collectionId || older.collectionId,
      sourceBatchId: newer.sourceBatchId || older.sourceBatchId,
      sourceOrder: newer.sourceOrder ?? older.sourceOrder,
      figures:
        newer.figures.some((f) => f.image || f.svg)
          ? newer.figures.map((fig, i) => ({
              ...fig,
              image: fig.image || older.figures[i]?.image,
              svg: fig.svg || older.figures[i]?.svg || "",
            }))
          : older.figures.length
            ? older.figures
            : newer.figures,
    });
  };
  for (const item of primary) take(item);
  for (const item of secondary) take(item);
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
