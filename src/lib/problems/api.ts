import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { coerceCollection, coerceCollectionList, isCollectionKind, type Collection } from "./collections";
import { coerceProblem, coerceProblemList } from "./coerce";
import { sanitizeSvg } from "./svg";
import {
  ERROR_REASONS,
  SUBJECTS,
  type Figure,
  type Problem,
} from "./types";

type ProblemRow = {
  id: string;
  created_at: number | string;
  updated_at: number | string;
  source_kind: string;
  source_image: string | null;
  title: string;
  stem: string;
  figures_json: string;
  subject: string;
  tags_json: string;
  difficulty: number | string;
  my_answer: string;
  correct_answer: string;
  analysis: string;
  notes: string;
  error_reason: string;
  mastery: string;
  review_count: number | string;
  next_review_at: number | string;
  collection_id: string | null;
};

function asNumber(value: number | string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

let schemaReady: Promise<void> | null = null;

async function ensureCollectionsSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = await getSql();
      await sql.query(`
        create table if not exists collections (
          user_id text not null,
          id text not null,
          name text not null,
          kind text not null default 'custom',
          created_at bigint not null,
          updated_at bigint not null,
          primary key (user_id, id)
        )
      `);
      await sql.query(
        "create index if not exists collections_user_updated_idx on collections (user_id, updated_at desc)",
      );
      try {
        await sql.query("alter table problems add column if not exists collection_id text");
      } catch {
        try {
          await sql.query("alter table problems add column collection_id text");
        } catch {
          /* column already exists */
        }
      }
      try {
        await sql.query(
          "create index if not exists problems_user_collection_idx on problems (user_id, collection_id)",
        );
      } catch {
        /* index optional */
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

function parseFigures(raw: string): Figure[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const figures: Figure[] = [];
    for (const item of parsed) {
      const fig = (item ?? {}) as Record<string, unknown>;
      const svg = typeof fig.svg === "string" ? sanitizeSvg(fig.svg) : null;
      const image =
        typeof fig.image === "string" && fig.image.startsWith("data:image/")
          ? fig.image.slice(0, 16_000_000)
          : undefined;
      if (!svg && !image) continue;
      figures.push({
        id: String(fig.id ?? crypto.randomUUID()).slice(0, 80),
        title: String(fig.title ?? "图形").slice(0, 80),
        svg: svg ?? "",
        caption: String(fig.caption ?? "").slice(0, 200),
        image,
      });
    }
    return figures.slice(0, 8);
  } catch {
    return [];
  }
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t) => String(t).slice(0, 16)).filter(Boolean).slice(0, 8);
  } catch {
    return [];
  }
}

function mapRow(row: ProblemRow): Problem {
  const difficulty = Math.min(5, Math.max(1, Math.round(asNumber(row.difficulty)))) as
    | 1
    | 2
    | 3
    | 4
    | 5;
  const mastery =
    row.mastery === "reviewing" || row.mastery === "mastered" ? row.mastery : "new";
  const sourceKind =
    row.source_kind === "photo" || row.source_kind === "text" || row.source_kind === "sample"
      ? row.source_kind
      : "text";
  const errorReason = (ERROR_REASONS as readonly string[]).includes(row.error_reason)
    ? (row.error_reason as Problem["errorReason"])
    : "unknown";
  const subject = (SUBJECTS as readonly string[]).includes(row.subject)
    ? (row.subject as Problem["subject"])
    : "other";
  return {
    id: row.id,
    createdAt: asNumber(row.created_at),
    updatedAt: asNumber(row.updated_at),
    sourceKind,
    sourceImage: row.source_image || undefined,
    title: row.title,
    stem: row.stem,
    figures: parseFigures(row.figures_json),
    subject,
    tags: parseTags(row.tags_json),
    difficulty,
    myAnswer: row.my_answer ?? "",
    correctAnswer: row.correct_answer ?? "",
    analysis: row.analysis ?? "",
    notes: row.notes ?? "",
    errorReason,
    mastery,
    reviewCount: asNumber(row.review_count),
    nextReviewAt: asNumber(row.next_review_at),
    collectionId: row.collection_id || undefined,
  };
}

async function listForUser(userId: string): Promise<Problem[]> {
  await ensureCollectionsSchema();
  const sql = await getSql();
  try {
    const rows = await sql<ProblemRow>`
      select id, created_at, updated_at, source_kind, title, stem,
             figures_json, subject, tags_json, difficulty, my_answer, correct_answer,
             analysis, notes, error_reason, mastery, review_count, next_review_at,
             collection_id
      from problems
      where user_id = ${userId}
      order by updated_at desc
    `;
    return rows.map((row) => {
      const problem = mapRow({ ...row, source_image: null });
      return {
        ...problem,
        figures: problem.figures.map((fig) => ({ ...fig, image: undefined, svg: "" })),
      };
    });
  } catch {
    const rows = await sql<Omit<ProblemRow, "collection_id">>`
      select id, created_at, updated_at, source_kind, title, stem,
             figures_json, subject, tags_json, difficulty, my_answer, correct_answer,
             analysis, notes, error_reason, mastery, review_count, next_review_at
      from problems
      where user_id = ${userId}
      order by updated_at desc
    `;
    return rows.map((row) => {
      const problem = mapRow({ ...row, source_image: null, collection_id: null });
      return {
        ...problem,
        figures: problem.figures.map((fig) => ({ ...fig, image: undefined, svg: "" })),
      };
    });
  }
}

async function isInitialized(userId: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select user_id from notebook_meta where user_id = ${userId} limit 1
  `;
  return rows.length > 0;
}

async function markInitialized(userId: string): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into notebook_meta (user_id, initialized_at)
    values (${userId}, ${Date.now()})
    on conflict (user_id) do nothing
  `;
}

function cleanProblem(input: Problem): Problem {
  return {
    ...input,
    title: input.title.slice(0, 80) || "未命名题目",
    stem: input.stem.slice(0, 8000),
    sourceImage: input.sourceImage?.slice(0, 16_000_000) || undefined,
    figures: input.figures.slice(0, 8).map((fig) => ({
      ...fig,
      svg: sanitizeSvg(fig.svg) ?? fig.svg ?? "",
      image:
        fig.image && fig.image.startsWith("data:image/")
          ? fig.image.slice(0, 16_000_000)
          : undefined,
    })),
    tags: input.tags.slice(0, 8),
    myAnswer: input.myAnswer.slice(0, 2000),
    correctAnswer: input.correctAnswer.slice(0, 2000),
    analysis: input.analysis.slice(0, 8000),
    notes: input.notes.slice(0, 4000),
    collectionId: input.collectionId?.slice(0, 80) || undefined,
  };
}

async function upsertOne(userId: string, input: Problem): Promise<void> {
  await ensureCollectionsSchema();
  const p = cleanProblem(input);
  const sql = await getSql();
  await sql`
    insert into problems (
      user_id, id, created_at, updated_at, source_kind, source_image,
      title, stem, figures_json, subject, tags_json, difficulty,
      my_answer, correct_answer, analysis, notes, error_reason,
      mastery, review_count, next_review_at, collection_id
    ) values (
      ${userId}, ${p.id}, ${p.createdAt}, ${p.updatedAt}, ${p.sourceKind},
      ${p.sourceImage ?? null}, ${p.title}, ${p.stem}, ${JSON.stringify(p.figures)},
      ${p.subject}, ${JSON.stringify(p.tags)}, ${p.difficulty}, ${p.myAnswer},
      ${p.correctAnswer}, ${p.analysis}, ${p.notes}, ${p.errorReason},
      ${p.mastery}, ${p.reviewCount}, ${p.nextReviewAt}, ${p.collectionId ?? null}
    )
    on conflict (user_id, id) do update set
      updated_at = excluded.updated_at,
      source_kind = excluded.source_kind,
      source_image = excluded.source_image,
      title = excluded.title,
      stem = excluded.stem,
      figures_json = excluded.figures_json,
      subject = excluded.subject,
      tags_json = excluded.tags_json,
      difficulty = excluded.difficulty,
      my_answer = excluded.my_answer,
      correct_answer = excluded.correct_answer,
      analysis = excluded.analysis,
      notes = excluded.notes,
      error_reason = excluded.error_reason,
      mastery = excluded.mastery,
      review_count = excluded.review_count,
      next_review_at = excluded.next_review_at,
      collection_id = excluded.collection_id
  `;
}

async function listCollections(userId: string): Promise<Collection[]> {
  await ensureCollectionsSchema();
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    name: string;
    kind: string;
    created_at: number | string;
    updated_at: number | string;
  }>`
    select id, name, kind, created_at, updated_at
    from collections
    where user_id = ${userId}
    order by updated_at desc
  `;
  return rows
    .map((row) =>
      coerceCollection({
        id: row.id,
        name: row.name,
        kind: row.kind,
        createdAt: asNumber(row.created_at),
        updatedAt: asNumber(row.updated_at),
      }),
    )
    .filter(Boolean) as Collection[];
}

async function upsertCollectionRow(userId: string, input: Collection): Promise<void> {
  await ensureCollectionsSchema();
  const sql = await getSql();
  const name = input.name.trim().slice(0, 40) || "未命名";
  const kind = isCollectionKind(input.kind) ? input.kind : "custom";
  await sql`
    insert into collections (user_id, id, name, kind, created_at, updated_at)
    values (${userId}, ${input.id}, ${name}, ${kind}, ${input.createdAt}, ${input.updatedAt})
    on conflict (user_id, id) do update set
      name = excluded.name,
      kind = excluded.kind,
      updated_at = excluded.updated_at
  `;
}

export const getNotebook = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const [problems, collections, initialized] = await Promise.all([
      listForUser(context.userId),
      listCollections(context.userId),
      isInitialized(context.userId),
    ]);
    return { problems, collections, initialized };
  });

export const bootstrapNotebook = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const obj = (input ?? {}) as { incoming?: unknown };
    return { incoming: Array.isArray(obj.incoming) ? coerceProblemList(obj.incoming) : undefined };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    if (await isInitialized(context.userId)) {
      return { problems: await listForUser(context.userId), collections: await listCollections(context.userId) };
    }
    const source = data.incoming?.length ? data.incoming : [];
    if (!source.length) {
      await markInitialized(context.userId);
      return { problems: [], collections: [] };
    }
    for (const problem of source) {
      await upsertOne(context.userId, problem);
    }
    await markInitialized(context.userId);
    return { problems: await listForUser(context.userId), collections: await listCollections(context.userId) };
  });

export const upsertProblem = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const problem = coerceProblem(input);
    if (!problem) throw new Error("题目格式不对");
    return problem;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await upsertOne(context.userId, data);
    await markInitialized(context.userId);
    return { ok: true as const };
  });

export const pushProblems = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const obj = (input ?? {}) as { problems?: unknown };
    return { problems: coerceProblemList(obj.problems) };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    for (const problem of data.problems) {
      await upsertOne(context.userId, problem);
    }
    await markInitialized(context.userId);
    return { problems: await listForUser(context.userId) };
  });

export const deleteProblemFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ id: z.string().min(1).max(80) }).parse(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      delete from problems
      where user_id = ${context.userId} and id = ${data.id}
    `;
    return { ok: true as const };
  });

export const getProblemFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ id: z.string().min(1).max(80) }).parse(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await ensureCollectionsSchema();
    const sql = await getSql();
    const rows = await sql<ProblemRow>`
      select id, created_at, updated_at, source_kind, source_image, title, stem,
             figures_json, subject, tags_json, difficulty, my_answer, correct_answer,
             analysis, notes, error_reason, mastery, review_count, next_review_at,
             collection_id
      from problems
      where user_id = ${context.userId} and id = ${data.id}
      limit 1
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  });

export const upsertCollectionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const collection = coerceCollection(input);
    if (!collection) throw new Error("分组格式不对");
    return collection;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await upsertCollectionRow(context.userId, data);
    await markInitialized(context.userId);
    return { ok: true as const };
  });

export const pushCollectionsFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const obj = (input ?? {}) as { collections?: unknown };
    return { collections: coerceCollectionList(obj.collections) };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    for (const item of data.collections) {
      await upsertCollectionRow(context.userId, item);
    }
    return { collections: await listCollections(context.userId) };
  });

export const deleteCollectionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ id: z.string().min(1).max(80) }).parse(input))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await ensureCollectionsSchema();
    const sql = await getSql();
    await sql`
      update problems set collection_id = null, updated_at = ${Date.now()}
      where user_id = ${context.userId} and collection_id = ${data.id}
    `;
    await sql`
      delete from collections
      where user_id = ${context.userId} and id = ${data.id}
    `;
    return { ok: true as const };
  });

