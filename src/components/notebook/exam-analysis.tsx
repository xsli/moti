import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import {
  BookOpen,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  Download,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MathText } from "@/lib/problems/math-text";
import { getProblemFn } from "@/lib/problems/api";
import { useProblemStore } from "@/lib/problems/store";
import { sortBySourceOrder } from "@/lib/problems/order";
import { stemSectionsWithFigures } from "@/lib/problems/subproblems";
import type { Problem } from "@/lib/problems/types";
import { FigureFrame } from "./figure-frame";
import { ExamAnalysisExportDialog } from "./exam-analysis-export-dialog";
import { getExamAnalysis, saveExamAnalysis, analyzeExamQuestion } from "@/lib/exam-analysis/api";
import {
  distribution,
  groupDistribution,
  uniqueLinks,
  linkedProblem,
  linkKey,
  RELATION_LABEL,
  type Relation,
  type ExamAnalysis,
  type AnalysisLink,
} from "@/lib/exam-analysis/model";

export function ExamAnalysisPage({
  id,
  view,
  questions,
}: {
  id: string;
  view: "overview" | "read";
  questions?: string;
}) {
  const questionIds = useMemo(
    () => new Set((questions || "").split(",").filter(Boolean)),
    [questions],
  );
  const scoped = questionIds.size > 0;
  const problems = useProblemStore((s) => s.problems),
    collections = useProblemStore((s) => s.collections),
    status = useProblemStore((s) => s.status);
  const collection = collections.find((c) => c.id === id),
    originals = useMemo(
      () => sortBySourceOrder(problems.filter((p) => p.collectionId === id)),
      [problems, id],
    );
  const [report, setReport] = useState<ExamAnalysis | null>(null),
    [busy, setBusy] = useState("读取分析…"),
    [error, setError] = useState("");
  const [stale, setStale] = useState<string[]>([]),
    [scopeChanged, setScopeChanged] = useState(false),
    [selectedOnly, setSelectedOnly] = useState(!scoped),
    [relation, setRelation] = useState("all"),
    [chapter, setChapter] = useState("all"),
    [answers, setAnswers] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [collapsedRows, setCollapsedRows] = useState<Set<string>>(() => new Set()),
    [addTo, setAddTo] = useState<number | null>(null);
  const stop = useRef(false),
    mounted = useRef(true),
    exportAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop.current = true;
      exportAbort.current?.abort();
    };
  }, []);
  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname &&
      !!busy &&
      !window.confirm("正在处理分析或导出，确定离开？已保存的结果会保留。"),
    enableBeforeUnload: !!busy,
  });
  useEffect(() => {
    let active = true;
    getExamAnalysis({ data: { collectionId: id } })
      .then((r) => {
        if (active) {
          setReport(r.report);
          setStale(r.staleIds);
          setScopeChanged(r.scopeChanged);
        }
      })
      .catch((e) => {
        if (active) setError(e.message || "读取失败");
      })
      .finally(() => {
        if (active) setBusy("");
      });
    return () => {
      active = false;
    };
  }, [id]);
  const ps = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems]);
  const cs = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const chapters = useMemo(
    () => (report ? distribution(report, problems, collections) : []),
    [report, problems, collections],
  );
  const groups = useMemo(
    () => (report ? groupDistribution(report, problems, collections) : []),
    [report, problems, collections],
  );
  const selectedCount = report
    ? uniqueLinks(report.rows).reduce((s, r) => s + r.links.length, 0)
    : 0;
  const allCount = report
    ? uniqueLinks(report.rows, false).reduce((s, r) => s + r.links.length, 0)
    : 0;
  const readRows = useMemo(
    () =>
      report
        ? uniqueLinks(
            report.rows.map((r) => ({
              ...r,
              links: r.links.filter(
                (l) =>
                  (!scoped || questionIds.has(r.problemId)) &&
                  (relation === "all" || l.relation === relation) &&
                  (chapter === "all" || ps.get(l.problemId)?.collectionId === chapter),
              ),
            })),
            selectedOnly,
          )
        : [],
    [report, relation, chapter, ps, selectedOnly, scoped, questionIds],
  );
  const source = (pid: string) => {
    const p = ps.get(pid),
      c = cs.get(p?.collectionId || "");
    return `${c?.groupName || ""} · ${c?.name || "未分组"} · ${p?.title || "题目已删除"}`;
  };
  function blank(): ExamAnalysis {
    return {
      version: 1,
      collectionId: id,
      revision: 0,
      updatedAt: 0,
      origin: "ai",
      summary: "",
      fingerprints: {},
      rows: originals.map((p) => ({
        problemId: p.id,
        topic: "",
        structure: "",
        method: "",
        notes: "",
        links: [],
        analyzedAt: 0,
        scannedCount: 0,
        reviewedCount: 0,
      })),
    };
  }
  async function save(next: ExamAnalysis) {
    setBusy("保存关联…");
    setError("");
    try {
      const saved = await saveExamAnalysis({
        data: { report: next, expectedRevision: report?.revision || 0 },
      });
      if (mounted.current) setReport(saved);
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
      throw e;
    } finally {
      if (mounted.current) setBusy("");
    }
  }
  async function generate(only?: number) {
    if (busy) return;
    stop.current = false;
    setError("");
    let work = report ? structuredClone(report) : blank();
    if (scopeChanged)
      work.rows = originals.map(
        (p) =>
          work.rows.find((r) => r.problemId === p.id) ||
          blank().rows.find((r) => r.problemId === p.id)!,
      );
    try {
      for (let i = 0; i < work.rows.length; i++) {
        if (only !== undefined && i !== only) continue;
        if (stop.current) break;
        setBusy(`分析原卷第 ${i + 1}/${work.rows.length} 题：检索全题库并判断关联…`);
        const result = await analyzeExamQuestion({
          data: { collectionId: id, problemId: work.rows[i].problemId },
        });
        if (!mounted.current || stop.current) break;
        work.rows[i] = result.row;
        work.fingerprints = { ...work.fingerprints, ...result.fingerprints };
        work.origin = work.origin === "reviewed" ? "mixed" : work.origin;
        work = await saveExamAnalysis({ data: { report: work, expectedRevision: work.revision } });
        setReport(work);
      }
      if (mounted.current) {
        const checked = await getExamAnalysis({ data: { collectionId: id } });
        setReport(checked.report);
        setStale(checked.staleIds);
        setScopeChanged(checked.scopeChanged);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "分析失败，之前的结果仍保留");
    } finally {
      if (mounted.current) setBusy("");
    }
  }
  async function pdf(selection: ExamAnalysis, originalIds: string[], includeSupport: boolean) {
    if (!report || busy) return;
    setError("");
    const abort = new AbortController();
    exportAbort.current = abort;
    setBusy("准备 PDF…");
    try {
      const { exportExamAnalysis } = await import("@/lib/exam-analysis/export");
      const blob = await exportExamAnalysis(
        selection,
        collection?.name || "试卷",
        problems,
        collections,
        abort.signal,
        setBusy,
        false,
        originalIds,
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `${collection?.name || "试卷"}-原题与关联练习${includeSupport ? "-含补充训练" : ""}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success("PDF 已导出");
      setExportOpen(false);
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      exportAbort.current = null;
      if (mounted.current) setBusy("");
    }
  }
  if (!collection && (status === "idle" || status === "loading"))
    return <p className="py-12">正在读取卷子…</p>;
  if (!collection || collection.kind !== "exam")
    return (
      <div className="space-y-4 py-12">
        <BackButton>
          <Link to="/" />
        </BackButton>
        <p>请从试卷类型的小组进入分析。</p>
      </div>
    );
  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center gap-2">
        <BackButton>
          <Link to="/" search={{ g: id }} />
        </BackButton>
        <span className="text-sm text-muted-foreground">{collection.groupName}</span>
      </div>
      <header>
        <h1 className="font-display text-2xl font-semibold">{collection.name}</h1>
      </header>
      <div className="sticky top-14 z-20 flex flex-wrap gap-2 border-y border-border bg-surface py-3 sm:top-16">
        <Button asChild variant={view === "overview" ? "default" : "outline"}>
          <Link to="/exam-analysis/$id" params={{ id }} search={{ view: "overview", questions }}>
            <ChartNoAxesCombined className="size-4" />
            分布与关联
          </Link>
        </Button>
        <Button asChild variant={view === "read" ? "default" : "outline"}>
          <Link to="/exam-analysis/$id" params={{ id }} search={{ view: "read", questions }}>
            <BookOpen className="size-4" />
            整体阅读
          </Link>
        </Button>
        <Button
          variant="outline"
          disabled={!!busy || !originals.length}
          onClick={() => void generate()}
        >
          <RefreshCw className="size-4" />
          {report ? (scoped ? "重新分析整卷" : "重新分析") : "开始分析"}
        </Button>
        <Button
          variant="outline"
          disabled={!!busy || !report || !!stale.length || scopeChanged}
          onClick={() => {
            setError("");
            setExportOpen(true);
          }}
        >
          <Download className="size-4" />
          {scoped ? "导出整卷 PDF" : "导出 PDF"}
        </Button>
      </div>
      {busy ? (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-secondary p-3">
          <LoaderCircle className="size-4 animate-spin" />
          {busy}
          {!busy.startsWith("读取") ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                stop.current = true;
                exportAbort.current?.abort();
              }}
            >
              停止
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-destructive">
          {error}
        </p>
      ) : null}
      {stale.length || scopeChanged ? (
        <p className="rounded-lg border border-amber-400 p-3 text-sm">
          {scopeChanged ? "原卷范围或顺序已改变。" : ""}
          {stale.length} 道引用题已修改或删除，请重新核对分析后导出。旧结果仍保留。
        </p>
      ) : null}
      {!report && !busy ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="text-xl">把整份卷子和题库关联起来</h2>
          <p className="mt-3 text-muted-foreground">
            分析原题的条件与解法，在全题库检索候选题并判断关联。结果保存后可直接阅读，无需每次调用
            AI。
          </p>
          <Button className="mt-5" onClick={() => void generate()}>
            开始分析这份卷子
          </Button>
        </div>
      ) : null}
      {report ? (
        <>
          {view === "overview" && !scoped ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  [
                    "已分析原题",
                    `${report.rows.filter((r) => r.analyzedAt).length}/${report.rows.length}`,
                  ],
                  ["关联题单元（去重）", allCount],
                  ["关联讲次", chapters.length],
                  ["推荐练习（去重）", selectedCount],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-xl border border-border p-4">
                    <div className="text-2xl font-semibold text-primary">{n}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
              <section className="rounded-xl border border-border p-4">
                <h2 className="text-lg font-semibold">大组分布</h2>
                <p className="my-2 text-xs text-muted-foreground">
                  绿色为原题、变形及方法关联；灰色为补充训练。各组内部去重，同题可在多个大组收录。
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  {groups.map((g) => (
                    <div key={g.name}>
                      <div className="mb-1 flex justify-between gap-3 text-sm">
                        <span>{g.name}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {g.direct} 关联 / {g.support} 补充 · 覆盖 {g.coverage} 题
                        </span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded bg-secondary">
                        <div
                          className="bg-primary"
                          style={{
                            width: `${(100 * g.direct) / Math.max(1, ...groups.map((x) => x.total))}%`,
                          }}
                        />
                        <div
                          className="bg-muted-foreground/30"
                          style={{
                            width: `${(100 * g.support) / Math.max(1, ...groups.map((x) => x.total))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-xl border border-border p-4">
                <h2 className="text-lg font-semibold">讲次分布与练习优先级</h2>
                <div className="max-h-[520px] overflow-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="sticky top-0 bg-surface">
                      <tr>
                        {["优先级 / 讲次", "原题", "变形", "方法", "补充", "覆盖原卷", "阅读"].map(
                          (x) => (
                            <th key={x} className="p-2">
                              {x}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {chapters.map((c, i) => (
                        <tr key={c.id} className="border-t border-border">
                          <td className="p-2">
                            <span className="mr-2 text-primary">{i + 1}</span>
                            <Link to="/" search={{ g: c.id }} className="hover:underline">
                              {c.group}
                              <br />
                              {c.name}
                            </Link>
                          </td>
                          <td>{c.exact}</td>
                          <td>{c.variant}</td>
                          <td>{c.method}</td>
                          <td>{c.support}</td>
                          <td>{c.coverage.join("、") || "—"}</td>
                          <td>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setChapter(c.id);
                                setSelectedOnly(false);
                                document.getElementById("analysis-links")?.scrollIntoView();
                              }}
                            >
                              查看关联
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
          <section id="analysis-links" className="scroll-mt-36 space-y-4">
            {scoped && (
              <div className="rounded-lg bg-secondary/50 p-3 text-sm">
                本批：原卷第{" "}
                {report.rows
                  .flatMap((r, i) => (questionIds.has(r.problemId) ? [i + 1] : []))
                  .join("、")}{" "}
                题 · 包含全部关联题与补充训练
                <Link
                  className="ml-3 text-primary underline"
                  to="/exam-analysis/$id"
                  params={{ id }}
                  search={{ view, questions: undefined }}
                >
                  查看整卷
                </Link>
                {!report.rows.some((r) => questionIds.has(r.problemId)) && (
                  <p>对应原题已不在当前分析中，请重新核对任务范围。</p>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">
                {view === "read" ? "原题与关联题阅读" : "逐题关联"}
              </h2>
              <select
                aria-label="关联类别"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                className="rounded-md border bg-surface p-2 text-sm"
              >
                <option value="all">全部关联类型</option>
                {Object.entries(RELATION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                aria-label="关联讲次"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                className="max-w-[300px] rounded-md border bg-surface p-2 text-sm"
              >
                <option value="all">全部讲次</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.group} / {c.name}
                  </option>
                ))}
              </select>
              {view === "read" ? (
                <>
                  {!scoped && (
                    <label className="text-sm">
                      <input
                        type="checkbox"
                        checked={selectedOnly}
                        onChange={(e) => setSelectedOnly(e.target.checked)}
                      />{" "}
                      只读推荐练习
                    </label>
                  )}
                  <label className="text-sm">
                    <input
                      type="checkbox"
                      checked={answers}
                      onChange={(e) => setAnswers(e.target.checked)}
                    />{" "}
                    显示答案解析
                  </label>
                </>
              ) : null}
              <select
                aria-label="跳转原题"
                className="rounded-md border bg-surface p-2 text-sm"
                defaultValue=""
                onChange={(e) => {
                  const index = Number(e.target.value);
                  const row = report.rows[index];
                  if (e.target.value === "" || !row) return;
                  setCollapsedRows((current) => {
                    const next = new Set(current);
                    next.delete(row.problemId);
                    return next;
                  });
                  requestAnimationFrame(() =>
                    document.getElementById(`exam-row-${index}`)?.scrollIntoView(),
                  );
                }}
              >
                <option value="">跳转原卷题号</option>
                {report.rows.map(
                  (r, i) =>
                    (!scoped || questionIds.has(r.problemId)) && (
                      <option key={r.problemId} value={i}>
                        {i + 1} · {r.topic || ps.get(r.problemId)?.title}
                      </option>
                    ),
                )}
              </select>
            </div>
            {report.rows.map((row, i) => {
              if (scoped && !questionIds.has(row.problemId)) return null;
              const collapsed = collapsedRows.has(row.problemId);
              const shown =
                view === "read"
                  ? readRows[i].links
                  : row.links.filter(
                      (l) =>
                        (relation === "all" || l.relation === relation) &&
                        (chapter === "all" || ps.get(l.problemId)?.collectionId === chapter),
                    );
              if (chapter !== "all" && !shown.length) return null;
              return (
                <section
                  id={`exam-row-${i}`}
                  key={row.problemId}
                  className="scroll-mt-36 space-y-4 rounded-xl border border-border p-4 sm:p-6"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="mr-auto text-lg font-semibold">
                      原卷第 {i + 1} 题 · {row.topic || ps.get(row.problemId)?.title}
                    </h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-expanded={!collapsed}
                      aria-controls={`exam-row-content-${i}`}
                      onClick={() =>
                        setCollapsedRows((current) => {
                          const next = new Set(current);
                          if (next.has(row.problemId)) next.delete(row.problemId);
                          else next.add(row.problemId);
                          return next;
                        })
                      }
                    >
                      {collapsed ? (
                        <ChevronRight className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                      {collapsed ? "展开本题" : "收起本题"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy || scopeChanged}
                      onClick={() => setAddTo(i)}
                    >
                      <Plus className="size-4" />
                      添加关联
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy || scopeChanged}
                      onClick={() => void generate(i)}
                    >
                      重新分析本题
                    </Button>
                  </div>
                  <div id={`exam-row-content-${i}`} hidden={collapsed} className="space-y-4">
                    <ProblemBody id={row.problemId} answers={view === "read" && answers} />
                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <div className="rounded-lg bg-secondary/50 p-3">
                        <b>条件结构</b>
                        <MathText text={row.structure || "尚未分析"} />
                      </div>
                      <div className="rounded-lg bg-secondary/50 p-3">
                        <b>解题方法</b>
                        <MathText text={row.method || "尚未分析"} />
                      </div>
                    </div>
                    {row.notes ? (
                      <p className="text-sm text-muted-foreground">{row.notes}</p>
                    ) : null}
                    {!shown.length ? (
                      <p className="py-3 text-sm text-muted-foreground">当前筛选下没有关联题。</p>
                    ) : null}
                    {shown.map((l) => (
                      <article
                        key={linkKey(l)}
                        className="space-y-3 rounded-lg border border-border p-4"
                      >
                        <div className="flex flex-wrap items-start gap-2">
                          <div className="flex flex-1 items-start gap-2">
                            <span className="min-w-0 text-sm">
                              <span className="mr-2 font-semibold text-primary">
                                {RELATION_LABEL[l.relation]}
                              </span>
                              {source(l.problemId)}
                              {l.parts.length ? ` · 第${l.parts.join("、")}小问` : ""}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {l.verified ? "已核对" : "AI 建议 / 待核对"}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!!busy || scopeChanged}
                            onClick={() => {
                              const next = structuredClone(report);
                              next.rows[i].links = next.rows[i].links.filter(
                                (x) => linkKey(x) !== linkKey(l),
                              );
                              void save(next).catch(() => {});
                            }}
                          >
                            移除
                          </Button>
                        </div>
                        <MathText className="text-sm" text={l.reason} />
                        {view === "overview" && !l.verified ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {!l.verified ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={!!busy || scopeChanged}
                                onClick={() => {
                                  const next = structuredClone(report);
                                  next.rows[i].links.find(
                                    (x) => linkKey(x) === linkKey(l),
                                  )!.verified = true;
                                  void save(next).catch(() => {});
                                }}
                              >
                                核对通过
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                        <ProblemBody
                          id={l.problemId}
                          link={l}
                          answers={view === "read" && answers}
                        />
                        <Link
                          to="/p/$id"
                          params={{ id: l.problemId }}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline"
                        >
                          在题库打开 ↗
                        </Link>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </section>
        </>
      ) : null}
      {exportOpen && report ? (
        <ExamAnalysisExportDialog
          report={report}
          problems={problems}
          source={source}
          busy={busy}
          error={error}
          onClose={() => setExportOpen(false)}
          onExport={pdf}
          onCancel={() => exportAbort.current?.abort()}
        />
      ) : null}
      <AddLink
        open={addTo !== null}
        onClose={() => setAddTo(null)}
        problems={problems.filter((p) => p.collectionId !== id)}
        onAdd={async (l) => {
          if (!report || addTo === null) return;
          const next = structuredClone(report),
            row = next.rows[addTo];
          if (row.links.some((x) => linkKey(x) === linkKey(l))) throw new Error("这道题已经关联。");
          row.links.push(l);
          await save(next);
          setAddTo(null);
        }}
      />
    </div>
  );
}

function ProblemBody({ id, link, answers }: { id: string; link?: AnalysisLink; answers: boolean }) {
  const [problem, setProblem] = useState<Problem | null>(null),
    [error, setError] = useState("");
  const ref = useRef<HTMLDivElement | null>(null),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "500px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    getProblemFn({ data: { id } })
      .then((p) => {
        if (active) {
          if (!p) setError("题目已删除");
          else setProblem(p);
        }
      })
      .catch(() => {
        if (active) setError("题目读取失败，请刷新重试");
      });
    return () => {
      active = false;
    };
  }, [id, visible]);
  let p = problem;
  try {
    if (p && link) p = linkedProblem(p, link);
  } catch (e) {
    return <p role="alert">{e instanceof Error ? e.message : "小问已变化"}</p>;
  }
  const sections = p ? stemSectionsWithFigures(p.stem, p.figures) : null;
  return (
    <div ref={ref} className="min-h-16 space-y-4 py-3">
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : !p ? (
        <p className="text-sm text-muted-foreground">加载题目…</p>
      ) : (
        <>
          {sections?.sections.map((s, i) => (
            <div key={i} className="space-y-3">
              <MathText text={s.text} figures={p.figures} />
              {s.figures.map((f) => (
                <FigureFrame key={f.id} svg={f.svg} image={f.image} className="max-w-xl" />
              ))}
            </div>
          ))}
          {sections?.trailingFigures.map((f) => (
            <FigureFrame key={f.id} svg={f.svg} image={f.image} className="max-w-xl" />
          ))}
          {answers ? (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="rounded-lg bg-primary/5 p-3">
                <b>答案</b>
                <MathText text={p.correctAnswer || "暂无答案"} />
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <b>解析</b>
                <MathText text={p.analysis || "暂无解析"} />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function AddLink({
  open,
  onClose,
  problems,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  problems: Problem[];
  onAdd: (l: AnalysisLink) => Promise<void>;
}) {
  const [query, setQuery] = useState(""),
    [pid, setPid] = useState(""),
    [relation, setRelation] = useState<Relation>("method"),
    [reason, setReason] = useState(""),
    [difference, setDifference] = useState(""),
    [parts, setParts] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setQuery("");
      setPid("");
      setReason("");
      setDifference("");
      setParts("");
      setError("");
    }
  }, [open]);
  const found = query.trim()
    ? problems
        .filter((p) =>
          `${p.title} ${p.stem} ${p.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 50)
    : [];
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>添加关联题</DialogTitle>
        </DialogHeader>
        <Input
          aria-label="搜索关联题"
          placeholder="搜索题干、题目名称或知识点"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="选择关联题"
          size={5}
          value={pid}
          onChange={(e) => setPid(e.target.value)}
          className="w-full rounded border bg-surface text-sm"
        >
          {found.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} · {p.stem.slice(0, 80)}
            </option>
          ))}
        </select>
        <select
          aria-label="关联类型"
          value={relation}
          onChange={(e) => setRelation(e.target.value as Relation)}
          className="rounded border bg-surface p-2"
        >
          {Object.entries(RELATION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Input
          placeholder="相关小问（如 1,2；留空表示整题）"
          value={parts}
          onChange={(e) => setParts(e.target.value)}
        />
        <Textarea
          placeholder="共同条件或解题步骤"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Textarea
          placeholder="主要差异"
          value={difference}
          onChange={(e) => setDifference(e.target.value)}
        />
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          disabled={saving || !pid || !reason.trim()}
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              const ns = parts.trim() ? parts.split(/[,，、\s]+/).map(Number) : [];
              if (ns.some((n) => !Number.isInteger(n) || n < 1 || n > 99))
                throw new Error("小问编号应为1—99的整数");
              await onAdd({
                problemId: pid,
                parts: [...new Set(ns)],
                relation,
                reason,
                difference,
                selected: true,
                duplicateKey: "",
                verified: true,
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "保存失败");
            } finally {
              setSaving(false);
            }
          }}
        >
          保存关联
        </Button>
      </DialogContent>
    </Dialog>
  );
}
