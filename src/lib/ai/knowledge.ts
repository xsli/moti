import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { localUserMiddleware } from "@/lib/local-user";
import { getNotebook, getProblemFn } from "@/lib/problems/api";
import { sortBySourceOrder } from "@/lib/problems/order";
import { runCodexJson } from "./codex";
import { buildKnowledgePrompt } from "./knowledge-prompt";
import { knowledgeKind, KNOWLEDGE_PROMPT_VERSION, withKnowledgeSources, type KnowledgeSource } from "./knowledge-schema";
import { knowledgeContentSchema, knowledgeScopeSchema, knowledgeScopeKey, parseKnowledgeContent, type KnowledgeReport, type KnowledgeScope } from "./knowledge-schema";

async function ensureSchema() {
  const sql = await getSql();
  await sql.query(`create table if not exists knowledge_reports (
    user_id text not null, scope_key text not null, report_json text not null,
    primary key (user_id, scope_key)
  )`);
  return sql;
}

async function loadSources(scope: KnowledgeScope) {
  const notebook = await getNotebook();
  const collection = "collectionId" in scope ? notebook.collections.find((c) => c.id === scope.collectionId) : undefined;
  if ("collectionId" in scope && !collection) throw new Error("这一讲已不存在。");
  const ids = "collectionId" in scope
    ? sortBySourceOrder(notebook.problems.filter((p) => p.collectionId === scope.collectionId)).map((p) => p.id)
    : [...new Set(scope.problemIds)];
  if (!ids.length) throw new Error("请先选择题目。");
  if (ids.length > 40) throw new Error(`当前共 ${ids.length} 道题，每次最多归纳40道，请分批选择。`);
  const sources = [];
  for (const id of ids) {
    const p = await getProblemFn({ data: { id } });
    if (!p) throw new Error("有题目已删除，请刷新后重新选择。");
    if (!p.stem.trim()) throw new Error(`“${p.title}”缺少题干，请先补全。`);
    sources.push(p);
  }
  const context = sources.map((p) => ({ id: p.id, title: p.title, stem: p.stem, answer: p.correctAnswer, analysis: p.analysis, tags: p.tags }));
  if (JSON.stringify(context).length > 160_000) throw new Error("所选题目内容过长，请减少题数后重试。");
  const title = collection ? `${collection.groupName} · ${collection.name}` : sources.length === 1 ? sources[0].title : `${sources.length}道题的方法归纳`;
  const fingerprint = createHash("sha256").update(JSON.stringify({ title, context, figures: sources.map((p) => p.figures), sourceImages: sources.map((p) => p.sourceImage) })).digest("hex");
  const snapshots: KnowledgeSource[] = sources.map(p => {
    const category = p.tags.includes("例题") ? "例题" : p.tags.includes("习题") ? "习题" : undefined;
    const siblings = sortBySourceOrder(notebook.problems.filter(s => s.collectionId === p.collectionId && !!category && s.tags.includes(category)));
    const number = siblings.findIndex(s => s.id === p.id) + 1;
    return { id: p.id, title: p.title, stem: p.stem,
      ...(category && p.collectionId && number ? { label: `${category} ${number}` } : {}),
      figures: p.figures.map(({ id, title, svg, caption, image, inline, subproblem }) => ({ id, title, svg, caption, image, inline, subproblem })),
    };
  });
  return { sources, snapshots, context, title, fingerprint };
}

export const getKnowledgeReport = createServerFn({ method: "POST" })
  .validator((input: unknown) => knowledgeScopeSchema.parse(input))
  .middleware([localUserMiddleware])
  .handler(async ({ data, context }): Promise<{ report: KnowledgeReport | null; stale: boolean }> => {
    const sql = await ensureSchema();
    const rows = await sql.query<{ report_json: string }>("select report_json from knowledge_reports where user_id=$1 and scope_key=$2", [context.userId, knowledgeScopeKey(data)]);
    if (!rows.length) return { report: null, stale: false };
    const report = { ...JSON.parse(rows[0].report_json), kind: knowledgeKind(data) } as KnowledgeReport;
    try {
      const current = await loadSources(data);
      return { report: withKnowledgeSources(report, { fingerprint: current.fingerprint, sources: current.snapshots }), stale: report.fingerprint !== current.fingerprint };
    }
    catch { return { report, stale: true }; }
  });

export const saveKnowledgeReport = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ scope: knowledgeScopeSchema, content: knowledgeContentSchema, expectedGeneratedAt: z.number() }).parse(input))
  .middleware([localUserMiddleware])
  .handler(async ({ data, context }): Promise<KnowledgeReport> => {
    const sql = await ensureSchema();
    const key = knowledgeScopeKey(data.scope);
    const rows = await sql.query<{ report_json: string }>("select report_json from knowledge_reports where user_id=$1 and scope_key=$2", [context.userId, key]);
    if (!rows[0]) throw new Error("笔记已不存在，请重新打开。");
    const previous = JSON.parse(rows[0].report_json) as KnowledgeReport;
    if (previous.generatedAt !== data.expectedGeneratedAt) throw new Error("笔记已被更新，请重新打开后编辑。");
    const current = await loadSources(data.scope);
    if (current.fingerprint !== previous.fingerprint) throw new Error("原题已变化，请重新提炼后再编辑。");
    const content = parseKnowledgeContent(data.content, current.sources.map((p) => p.id));
    const report = { ...previous, sources: current.snapshots, content, generatedAt: Math.max(Date.now(), previous.generatedAt + 1) };
    const updated = await sql.query("update knowledge_reports set report_json=$1 where user_id=$2 and scope_key=$3 and report_json=$4 returning scope_key", [JSON.stringify(report), context.userId, key, rows[0].report_json]);
    if (!updated.length) throw new Error("笔记已被更新，请重新打开后编辑。");
    return report;
  });

export const generateKnowledgeReport = createServerFn({ method: "POST" })
  .validator((input: unknown) => knowledgeScopeSchema.parse(input))
  .middleware([localUserMiddleware])
  .handler(async ({ data, context }): Promise<{ ok: true; report: KnowledgeReport } | { ok: false; error: string }> => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 360_000);
    try {
      const { sources, snapshots, context: problems, title, fingerprint } = await loadSources(data);
      const sql = await ensureSchema();
      const key = knowledgeScopeKey(data);
      const previous = await sql.query<{ report_json: string }>("select report_json from knowledge_reports where user_id=$1 and scope_key=$2", [context.userId, key]);
      const images: string[] = [];
      const imageNotes: string[] = [];
      for (const p of sources) {
        const media = p.figures.length ? p.figures.map((f) => f.originalImage || f.image || "") : p.sourceImage ? [p.sourceImage] : [];
        for (const image of media) {
          if (/^data:image\/(png|jpeg|webp);base64,/.test(image) && images.length < 24) {
            images.push(image); imageNotes.push(`第${images.length}张图属于题目 ${p.id}`);
          } else imageNotes.push(`题目 ${p.id} 有图片未提供，不能推测图中条件；如影响归纳必须列入 uncertainties。`);
        }
      }
      const raw = await runCodexJson<unknown>({
        prompt: `${buildKnowledgePrompt(data, title)}
图片对应：${imageNotes.join("；")}
原题编号使用 sourceLabel，不按当前输入次序重新编号。
题目资料：${JSON.stringify(problems.map((p, i) => ({ ...p, sourceLabel: snapshots[i].label })))}`,
        images, outputSchema: z.toJSONSchema(knowledgeContentSchema), signal: abort.signal, imageOnly: true,
      });
      const content = parseKnowledgeContent(raw, sources.map((p) => p.id));
      if ((await loadSources(data)).fingerprint !== fingerprint) throw new Error("生成期间原题发生变化，请重试。已有沉淀仍保留。");
      const report: KnowledgeReport = { kind: knowledgeKind(data), promptVersion: KNOWLEDGE_PROMPT_VERSION, content, sources: snapshots, fingerprint, generatedAt: Date.now() };
      const saved = previous[0]
        ? await sql.query("update knowledge_reports set report_json=$1 where user_id=$2 and scope_key=$3 and report_json=$4 returning scope_key", [JSON.stringify(report), context.userId, key, previous[0].report_json])
        : await sql.query("insert into knowledge_reports (user_id,scope_key,report_json) values ($1,$2,$3) on conflict (user_id,scope_key) do nothing returning scope_key", [context.userId, key, JSON.stringify(report)]);
      if (!saved.length) throw new Error("生成期间笔记已被更新，请重新打开查看最新归纳。");
      return { ok: true, report };
    } catch (error) {
      return { ok: false, error: abort.signal.aborted ? "归纳超时，请减少题数后重试。已有沉淀仍保留。" : error instanceof Error && /题|归纳|原题|生成期间/.test(error.message) ? error.message : "未能完成知识归纳，请重试。已有沉淀仍保留。" };
    } finally { clearTimeout(timer); }
  });
