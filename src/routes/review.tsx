import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ExternalLink, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigureFrame } from "@/components/notebook/figure-frame";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Skeleton } from "@/components/ui/skeleton";
import { MathText } from "@/lib/problems/math-text";
import { selectDueProblems, useProblemStore } from "@/lib/problems/store";
import { buildReviewQueue } from "@/lib/problems/review-session";
import { sortCollectionsByOrder } from "@/lib/problems/collections";
import { z } from "zod";

const resumeSchema = z.object({
  scope: z.string().refine((value) => { try { return !value || typeof JSON.parse(value) === "string"; } catch { return false; } }),
  group: z.string(), limit: z.union([z.literal(10), z.literal(20), z.literal(50)]),
  queue: z.array(z.string()).max(50), done: z.number().int().min(0).max(50),
});

export const Route = createFileRoute("/review")({ component: ReviewPage });

function ReviewPage() {
  const problems = useProblemStore((s) => s.problems);
  const collections = useProblemStore((s) => s.collections);
  const status = useProblemStore((s) => s.status);
  const markReview = useProblemStore((s) => s.markReview);
  const loadProblem = useProblemStore((s) => s.loadProblem);
  const userId = useProblemStore((s) => s.userId);
  const storageKey = `moti-review-session:${userId || "local"}`;
  const [restoredKey, setRestoredKey] = useState("");
  const [scope, setScope] = useState("");
  const [group, setGroup] = useState("");
  const [limit, setLimit] = useState(20);
  const [queue, setQueue] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const folders = useMemo(() => [...new Set(collections.map((c) => c.groupName))].sort((a, b) => a.localeCompare(b, "zh")), [collections]);
  const groups = sortCollectionsByOrder(collections.filter((c) => !scope || c.groupName === JSON.parse(scope)), (c) => c.createdAt);
  const due = useMemo(() => selectDueProblems(problems), [problems]);
  const available = buildReviewQueue(due, collections, { folder: scope ? JSON.parse(scope) as string : undefined, group, limit });
  const current = problems.find((p) => p.id === queue[0]);
  const total = queue.length + done;

  useEffect(() => {
    if (status !== "ready") return;
    setScope(""); setGroup(""); setLimit(20); setQueue([]); setDone(0);
    try {
      const parsed = resumeSchema.safeParse(JSON.parse(localStorage.getItem(storageKey) || "null"));
      if (parsed.success) {
        setScope(parsed.data.scope); setGroup(parsed.data.group); setLimit(parsed.data.limit);
        const known = new Set(useProblemStore.getState().problems.map((p) => p.id));
        setQueue([...new Set(parsed.data.queue)].filter((id) => known.has(id)));
        setDone(parsed.data.done);
      }
    } catch { /* A missing or invalid local preference must not block review. */ }
    setStarted(false); setRestoredKey(storageKey);
  }, [storageKey, status]);

  useEffect(() => {
    if (restoredKey !== storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ scope, group, limit, queue, done })); }
    catch { /* Review results are still saved through the problem store. */ }
  }, [storageKey, restoredKey, scope, group, limit, queue, done]);

  function resetProgress() { setQueue([]); setDone(0); }

  useEffect(() => {
    if (!started || !queue[0]) return;
    let live = true;
    setLoading(true);
    void loadProblem(queue[0]).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [started, queue[0], loadProblem]);

  if (status !== "ready") return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-72 rounded-lg" /></div>;

  async function nextAfter(remembered: boolean) {
    if (!current || busy) return;
    setBusy(true);
    try {
      await markReview(current.id, remembered);
      setQueue((q) => q.slice(1));
      setDone((n) => n + 1);
      setRevealed(false);
    } catch { toast.error("记录失败，请重试"); }
    finally { setBusy(false); }
  }

  if (!started) return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3"><h1 className="font-display text-2xl font-semibold">复习</h1><span className="text-sm text-muted-foreground">待复习 {due.length} 道</span></div>
      <div className="grid gap-5 border-y border-border py-6 sm:grid-cols-2">
        <div className="space-y-2 text-sm">大组<SearchableSelect label="复习大组" value={scope} onChange={(value) => { setScope(value); setGroup(""); resetProgress(); }} options={[{ value: "", label: "全部大组" }, ...folders.map((f) => ({ value: JSON.stringify(f), label: f || "未分大组" }))]} /></div>
        <div className="space-y-2 text-sm">小组<SearchableSelect label="复习小组" value={group} onChange={(value) => { setGroup(value); resetProgress(); }} options={[{ value: "", label: "全部小组" }, ...groups.map((g) => ({ value: g.id, label: `${scope ? "" : `${g.groupName || "未分大组"} / `}${g.name}` }))]} /></div>
        <label className="space-y-2 text-sm">本轮题量<select aria-label="本轮题量" className="block h-10 w-full rounded-md border border-border bg-surface px-3" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); resetProgress(); }}>{[10, 20, 50].map((n) => <option key={n} value={n}>{n} 道</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">{queue.length || !available.length ? <p className="mr-auto text-sm text-muted-foreground">{queue.length ? `已复习 ${done} 道，还剩 ${queue.length} 道` : "所选范围没有待复习题目"}</p> : null}<Button disabled={restoredKey !== storageKey || (!queue.length && !available.length)} onClick={() => { if (!queue.length) { setQueue(available); setDone(0); } setRevealed(false); setStarted(true); }}>{queue.length ? "继续复习" : available.length ? `开始复习 · ${available.length} 题` : "开始复习"}</Button></div>
    </div>
  );

  if (!current) return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="font-display text-2xl font-semibold">这轮复习完成了</h1>
      <p className="mt-3 text-sm text-muted-foreground">已复习 {done} 道题</p>
      <div className="mt-6 flex justify-center gap-2"><BackButton><Link to="/" /></BackButton><Button onClick={() => setStarted(false)}>再来一轮</Button></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3"><BackButton onClick={() => setStarted(false)} disabled={busy} title="返回复习设置" /><h1 className="font-display text-xl font-semibold">复习</h1><span className="text-sm tabular-nums text-muted-foreground">{done + 1} / {total}</span></div>
      <div className="h-1 rounded-full bg-rule" role="progressbar" aria-label="本轮进度" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><div className="h-full rounded-full bg-primary" style={{ width: `${done / total * 100}%` }} /></div>
      <article className="space-y-5">
        <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold">{current.title}</h2><Button variant="ghost" size="icon" title="打开完整题目" aria-label="打开完整题目" asChild><Link to="/p/$id" params={{ id: current.id }}><ExternalLink /></Link></Button></div>
        <MathText text={current.stem} />
        {current.figures.map((figure) => <FigureFrame key={figure.id} svg={figure.svg} image={figure.image} caption={figure.caption} />)}
        {loading ? <p role="status" className="text-sm text-muted-foreground">加载完整题目…</p> : null}
        {revealed ? <>
          {current.myAnswer ? <section><h3 className="text-sm font-semibold">我的作答</h3><MathText text={current.myAnswer} className="mt-2 text-sm" /></section> : null}
          <section className="border-l-2 border-emerald-700/40 bg-emerald-50/70 p-4 text-emerald-900"><h3 className="mb-2 text-sm font-semibold">答案</h3><MathText text={current.correctAnswer || "（尚未填写）"} /></section>
          <section className="border-l-2 border-sky-700/40 bg-sky-50/70 p-4 text-sm text-sky-900"><h3 className="mb-2 font-semibold">解析</h3><MathText text={current.analysis || "（尚未填写）"} tight /></section>
        </> : <Button onClick={() => setRevealed(true)} disabled={loading}>查看答案与解析</Button>}
      </article>
      {revealed ? <div className="grid grid-cols-2 gap-3"><Button variant="outline" disabled={busy} onClick={() => void nextAfter(false)}><X />还需复习</Button><Button disabled={busy} onClick={() => void nextAfter(true)}><Check />记住了</Button></div> : null}
    </div>
  );
}
