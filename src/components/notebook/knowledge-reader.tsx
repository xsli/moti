import { useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { Download, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { MathText } from "@/lib/problems/math-text";
import { generateKnowledgeReport, getKnowledgeReport, saveKnowledgeReport } from "@/lib/ai/knowledge";
import { Textarea } from "@/components/ui/textarea";
import { knowledgeContentSchema, knowledgeMarkdown, knowledgeScopeKey, type KnowledgeContent, type KnowledgeReport, type KnowledgeScope } from "@/lib/ai/knowledge-schema";
import { exportKnowledgePdf } from "@/lib/ai/knowledge-pdf";
import { knowledgeKind, knowledgeLabels, knowledgeSourceName, representativeSource, KNOWLEDGE_PROMPT_VERSION, type KnowledgeSource } from "@/lib/ai/knowledge-schema";

export function KnowledgeReader({ scope, returnTo, sourceTitle }: { scope: KnowledgeScope; returnTo: string; sourceTitle?: string }) {
  const navigate = useNavigate();
  const [report, setReport] = useState<KnowledgeReport | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState<"load" | "generate" | "save" | "pdf" | null>("load");
  const [draft, setDraft] = useState<KnowledgeContent | null>(null);
  const [error, setError] = useState("");
  const key = knowledgeScopeKey(scope);
  const kind = knowledgeKind(scope);
  const labels = knowledgeLabels(kind);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(report?.content);
  const working = busy === "generate" || busy === "save" || busy === "pdf";
  useBlocker({
    shouldBlockFn: ({ current, next }) => {
      if (current.pathname === next.pathname && JSON.stringify(current.search) === JSON.stringify(next.search)) return false;
      if (dirty) return !window.confirm("有尚未保存的笔记修改，确定放弃修改并离开？");
      return working && !window.confirm("笔记正在处理中，确定离开？离开后可重新打开查看结果。");
    },
    enableBeforeUnload: dirty || working,
  });
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const requestRef = useRef(0);
  useEffect(() => {
    const request = ++requestRef.current;
    setBusy("load"); setError(""); setReport(null); setStale(false); setDraft(null);
    void getKnowledgeReport({ data: scopeRef.current }).then((result) => {
      if (request !== requestRef.current) return;
      setReport(result.report); setStale(result.stale);
    }).catch(() => { if (request === requestRef.current) setError("读取沉淀失败，请刷新页面重试。"); })
      .finally(() => { if (request === requestRef.current) setBusy(null); });
    return () => { requestRef.current += 1; };
  }, [key]);

  async function generate() {
    if (busy) return;
    const request = ++requestRef.current;
    setBusy("generate"); setError("");
    try {
      const result = await generateKnowledgeReport({ data: scopeRef.current });
      if (request !== requestRef.current) return;
      if (!result.ok) { setError(result.error); return; }
      setReport(result.report); setStale(false);
    } catch { if (request === requestRef.current) setError("请求中断，请重新打开查看是否已保存，或重试。"); }
    finally { if (request === requestRef.current) setBusy(null); }
  }

  async function save() {
    if (!draft || !report || busy) return;
    if (!knowledgeContentSchema.safeParse(draft).success) {
      setError("有内容为空或过长，请补全后保存。总标题最多120字，其他每项最多4000字。");
      return;
    }
    const request = ++requestRef.current;
    setBusy("save"); setError("");
    try {
      const saved = await saveKnowledgeReport({ data: { scope: scopeRef.current, content: draft, expectedGeneratedAt: report.generatedAt } });
      if (request !== requestRef.current) return;
      setReport(saved); setDraft(null);
    } catch (e) { if (request === requestRef.current) setError(e instanceof Error ? e.message : "保存失败，请重试。"); }
    finally { if (request === requestRef.current) setBusy(null); }
  }

  function download() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([knowledgeMarkdown(report)], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${report.content.title.replace(/[\\/:*?"<>|]/g, "-")}-知识沉淀.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function downloadPdf() {
    if (!report || busy || draft) return;
    const request = ++requestRef.current;
    const filename = `${report.content.title.replace(/[\\/:*?"<>|]/g, "-")}-知识沉淀.pdf`;
    setBusy("pdf"); setError("");
    try {
      const result = await exportKnowledgePdf({ data: { scope: scopeRef.current, expectedGeneratedAt: report.generatedAt } });
      if (request !== requestRef.current) return;
      if (!result.ok) { setError(result.error); return; }
      const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { if (request === requestRef.current) setError("PDF 导出中断，请重试。笔记仍已保存。"); }
    finally { if (request === requestRef.current) setBusy(null); }
  }
  const references = (ids: string[]) => <div className="mt-3 space-y-2">{ids.map((id) => {
    const source = report?.sources.find(s => s.id === id);
    return <details key={id} className="rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-xs text-primary">{source ? knowledgeSourceName(source) : "查看原题"} · 展开题目</summary>{source ? <div className="mt-3"><SourceProblem source={source} /></div> : null}<Link to="/p/$id" params={{ id }} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-primary">在题库打开 ↗</Link></details>;
  })}</div>;
  const content = report?.content;
  return <div className="space-y-5 pb-6 [&_[id]]:scroll-mt-36">
        <div className="sticky top-14 z-20 flex items-center gap-3 border-b border-border bg-bg/95 py-3 backdrop-blur-md sm:top-16">
          <BackButton onClick={() => void navigate({ to: returnTo })} />
          <span className="text-sm font-medium">知识沉淀 · {labels.name}</span>
        </div>
        <header className="space-y-2">
          {sourceTitle ? <p className="text-sm text-muted-foreground">{sourceTitle}</p> : null}
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{labels.name}</h1>
        </header>
        <div>
          <div className="flex flex-wrap items-center gap-2 py-4">
            <Button disabled={!!busy || !!draft} onClick={() => void generate()} size="sm">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy === "load" ? "读取中…" : busy === "generate" ? "正在提炼方法…" : report ? "重新提炼" : "开始提炼"}
            </Button>
            {report ? <><Button size="sm" variant="outline" disabled={!!busy || !!draft} onClick={() => void downloadPdf()}>{busy === "pdf" ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}{busy === "pdf" ? "正在排版…" : "导出 PDF"}</Button><Button size="sm" variant="outline" disabled={!!busy || !!draft} onClick={download}>导出 Markdown</Button></> : null}
            {report && !draft ? <Button size="sm" variant="outline" disabled={!!busy || stale} onClick={() => setDraft(structuredClone(report.content))}>编辑笔记</Button> : null}
            {draft ? <><Button size="sm" disabled={!!busy} onClick={() => void save()}>{busy === "save" ? "保存中…" : "保存修改"}</Button><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => { setDraft(null); setError(""); }}>取消编辑</Button></> : null}
            <span className="text-xs text-muted-foreground">{report ? `${report.sources.length}道题 · 已保存 · ${new Date(report.generatedAt).toLocaleDateString("zh-CN")}` : "生成后自动保存，每次最多40道题"}</span>
          </div>
          {busy === "generate" ? <p role="status" className="mb-4 text-sm text-muted-foreground">{kind === "single" ? "正在核对原题、梳理突破口与推理链" : "正在比较题目、归并题型和整理选法路线"}，通常需要几分钟，请保持页面打开。</p> : null}
          {report && report.promptVersion !== KNOWLEDGE_PROMPT_VERSION ? <p className="mb-4 text-sm text-muted-foreground">这是旧版提示词生成的笔记。重新提炼后将按{labels.name}的方向整理，旧内容不会自动改写。</p> : null}
          {error ? <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          {stale ? <p role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">原题内容或本讲题目范围已变化，以下是上次保存的沉淀，建议重新提炼。</p> : null}
          {!content && !busy ? <div className="space-y-3 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground"><p>{labels.description}</p><p>{kind === "single" ? "题面线索 → 突破口 → 推理链 → 卡点 → 变式迁移。" : "知识体系 → 方法选择路线 → 题型对照 → 代表题 → 跨题型自测。"}</p><p>生成后独立保存，再次打开直接读取。</p></div> : null}
          {draft ? <KnowledgeEditor content={draft} labels={labels} onChange={setDraft} disabled={!!busy} /> : content ? <article className="space-y-7 text-sm leading-relaxed">
            <section className="rounded-xl bg-muted/60 p-5"><h2 className="mb-3 text-xl font-semibold">{content.title}</h2><MathText text={content.takeaway} /></section>
            {kind === "single" && report?.sources[0]?.stem ? <section className="rounded-xl border border-border p-4"><h3 className="mb-3 font-semibold">原题</h3><MathText text={report.sources[0].stem} />{references([report.sources[0].id])}</section> : null}
            {kind !== "single" ? <section className="rounded-xl bg-primary/5 p-4"><h3 className="mb-3 text-lg font-semibold">{labels.checklist}</h3><ol className="list-decimal space-y-2 pl-5">{content.checklist.map((v, i) => <li key={i}><MathText text={v} /></li>)}</ol></section> : null}
            {content.uncertainties.length ? <section className="rounded-xl border border-amber-300 p-4"><h3 className="mb-2 font-semibold">先核对这些条件</h3>{content.uncertainties.map((v, i) => <MathText key={i} text={v} className="mb-2" />)}</section> : null}
            <section><h3 className="mb-3 text-lg font-semibold">{labels.concepts}</h3><div className="space-y-4">{content.concepts.map((v, i) => <div key={i} className="min-w-0 rounded-xl border border-border p-4 sm:p-5"><h4 className="mb-4 text-base font-semibold"><MathText text={v.title} /></h4><MathText text={v.explanation} />{references(v.problemIds)}</div>)}</div></section>
            <section><h3 className="mb-3 text-lg font-semibold">{labels.methods}</h3><div className="space-y-4">{content.methods.map((v, i) => <section key={i} id={`knowledge-method-${i}`} className="min-w-0 rounded-xl border border-border p-4 sm:p-5">
              <h4 className="mb-4 text-base font-semibold"><MathText text={`${i + 1}. ${v.title}`} /></h4>
              <div className="space-y-3"><Field label={labels.signal} text={v.signal} /><Field label={labels.idea} text={v.idea} />
                <div><p className="mb-1 font-medium text-muted-foreground">{labels.steps}</p><ol className="list-decimal space-y-2 pl-5">{v.steps.map((s, n) => <li key={n}><MathText text={s} /></li>)}</ol></div>
                {kind !== "single" && report ? (() => { const source = representativeSource(report, v); return source ? <div className="rounded-lg border border-primary/20 p-3"><p className="mb-2 font-semibold">对照原题 · {knowledgeSourceName(source)}</p><SourceProblem source={source} /></div> : null; })() : null}
                <div className="rounded-lg bg-muted/50 p-3"><Field label={labels.example} text={v.example} /></div><Field label={labels.pitfalls} text={v.pitfalls} />
              </div>{references(v.problemIds)}
            </section>)}</div></section>
            {kind === "single" ? <section><h3 className="mb-3 text-lg font-semibold">{labels.checklist}</h3><ol className="list-decimal space-y-2 pl-5">{content.checklist.map((v, i) => <li key={i}><MathText text={v} /></li>)}</ol></section> : null}
            <section><h3 className="mb-3 text-lg font-semibold">{labels.selfChecks}</h3><div className="space-y-2">{content.selfChecks.map((v, i) => <details key={i} className="rounded-lg border border-border p-3"><summary className="cursor-pointer"><span className="inline-block align-top"><MathText text={v.question} /></span></summary><div className="mt-3 border-t border-border pt-3"><MathText text={v.answer} /></div></details>)}</div></section>
            <section><h3 className="mb-3 text-lg font-semibold">{kind === "single" ? labels.coverage : "完整原题与方法索引"} · {content.coverage.length}题</h3><div className="space-y-3">{report?.sources.map((s, i) => <div key={s.id} id={`knowledge-source-${i}`} className="rounded-xl border border-border p-4"><h4 className="mb-3 font-semibold">{knowledgeSourceName(s)}</h4>{kind !== "single" ? <SourceProblem source={s} /> : null}<MathText className="mt-3 text-primary" text={content.coverage.find(v => v.problemId === s.id)?.takeaway || ""} /><div className="mt-3 flex flex-wrap gap-3">{content.methods.flatMap((m, n) => m.problemIds.includes(s.id) ? [<a key={n} href={`#knowledge-method-${n}`} className="text-xs text-primary">回到方法 {n + 1}：{m.title}</a>] : [])}<Link to="/p/$id" params={{id:s.id}} target="_blank" rel="noreferrer" className="text-xs text-primary">在题库打开 ↗</Link></div></div>)}</div></section>
            <p className="text-xs text-muted-foreground">AI 归纳，请结合原题核对。沉淀独立保存，原题的题干、答案和笔记不受影响。</p>
          </article> : null}
        </div>
  </div>;
}

const fieldNames: Record<string, string> = { title: "标题", takeaway: "一句话收获", explanation: "核心知识", signal: "看到什么", idea: "为什么这样想", steps: "怎么做", example: "原题串讲", pitfalls: "易错点", checklist: "思考顺序", question: "自测问题", answer: "自测答案", uncertainties: "待核对" };

function KnowledgeEditor({ content, labels, onChange, disabled }: { labels: ReturnType<typeof knowledgeLabels>; content: KnowledgeContent; onChange: (value: KnowledgeContent) => void; disabled: boolean }) {
  const editorNames: Record<string, string> = { ...fieldNames, ...labels };
  const groups = [
    { title: labels.takeaway, value: { title: content.title, takeaway: content.takeaway }, path: [] as (string | number)[] },
    ...content.concepts.map((value, i) => ({ title: `${labels.concepts} ${i + 1}`, value, path: ["concepts", i] })),
    ...content.methods.map((value, i) => ({ title: `${labels.methods} ${i + 1}`, value, path: ["methods", i] })),
    { title: labels.checklist, value: { checklist: content.checklist }, path: [] },
    ...content.selfChecks.map((value, i) => ({ title: `${labels.selfChecks} ${i + 1}`, value, path: ["selfChecks", i] })),
    ...content.coverage.map((value, i) => ({ title: `${labels.coverage} ${i + 1}`, value, path: ["coverage", i] })),
    { title: "待核对", value: { uncertainties: content.uncertainties }, path: [] },
  ];
  function update(path: (string | number)[], value: string) {
    const next = structuredClone(content);
    let node = next as unknown as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
    node[path[path.length - 1]] = value; onChange(next);
  }
  return <div className="space-y-3"><p className="text-sm text-muted-foreground">可补充自己的理解，支持 $LaTeX$ 公式。修改后请保存；离开页面前会提醒尚未保存的内容。重新提炼会替换当前笔记，建议先导出留存。</p>{groups.map((group, i) => <details key={i} open={i === 0} className="rounded-lg border border-border p-3"><summary className="cursor-pointer font-medium">{group.title}</summary><div className="mt-3 space-y-3">{Object.entries(group.value).filter(([key]) => key !== "problemId" && key !== "problemIds").flatMap(([key, value]) => (Array.isArray(value) ? value.map((v, n) => ({ value: v, path: [...group.path, key, n], label: `${editorNames[key] || key} ${n + 1}` })) : [{ value, path: [...group.path, key], label: editorNames[key] || key }]).map((field, n) => <label key={`${key}-${n}`} className="block text-sm">{field.label}<Textarea disabled={disabled} value={String(field.value)} onChange={(event) => update(field.path, event.target.value)} className="mt-1 min-h-24" /></label>))}</div></details>)}</div>;
}

function Field({ label, text }: { label: string; text: string }) {
  return <div><p className="mb-1 font-medium text-muted-foreground">{label}</p><MathText text={text} /></div>;
}

function SourceProblem({ source }: { source: KnowledgeSource }) {
  return <div className="space-y-3"><MathText text={source.stem || "此笔记未保存原题快照，请在题库中核对。"} figures={source.figures} />{source.figures?.filter(f => !f.inline).map(f => <figure key={f.id}>{f.image?.startsWith("data:image/") ? <img src={f.image} alt={f.caption || f.title || "原题配图"} className="max-h-72 max-w-full object-contain" /> : <p>配图暂不可显示，请在题库核对。</p>}{f.subproblem ? <figcaption className="text-xs text-muted-foreground">第 {f.subproblem} 小问配图</figcaption> : null}</figure>)}</div>;
}
