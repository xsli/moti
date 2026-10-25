import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useProblemStore } from "@/lib/problems/store";
import { OUTCOME_LABEL, practiceStats, practiceSummary } from "@/lib/problems/review";
import { ERROR_REASONS, ERROR_REASON_LABEL, type ErrorReason, type PracticeOutcome, type Problem } from "@/lib/problems/types";

export function PracticeSummary({ problem }: { problem: Problem }) {
  return <span className={`text-xs ${practiceStats(problem).wrong >= 2 ? "text-destructive" : "text-muted-foreground"}`}>{practiceSummary(problem)}</span>;
}

export function AddPracticeRecord({ problem, disabled = false }: { problem: Problem; disabled?: boolean }) {
  const mark = useProblemStore(s => s.markReview);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [outcome, setOutcome] = useState<PracticeOutcome | null>(null);
  const [reason, setReason] = useState<ErrorReason>("unknown");
  function changeOpen(next: boolean) {
    if (pending.current) return;
    if (next) { setOutcome(null); setReason("unknown"); }
    setOpen(next);
  }
  async function save() {
    if (pending.current || !outcome) return;
    pending.current = true; setBusy(true);
    try {
      await mark(problem.id, outcome, outcome === "correct" ? "unknown" : reason);
      setOpen(false);
      toast.success("已记录本次练习");
    } catch (error) { toast.error(error instanceof Error ? error.message : "记录失败，请重试"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm" disabled={disabled}><Plus className="size-4" />增加练习记录</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>增加练习记录</DialogTitle><DialogDescription>{problem.title}</DialogDescription></DialogHeader>
      <form className="space-y-5" onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy} className="space-y-3">
          <legend className="mb-3 text-sm font-medium">本次结果</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(["wrong", "hinted", "correct"] as PracticeOutcome[]).map(value => <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-3 text-sm ${outcome === value ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
              <input type="radio" name="practice-outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} className="accent-primary" />{OUTCOME_LABEL[value]}
            </label>)}
          </div>
          {outcome && outcome !== "correct" ? <label className="flex items-center gap-3 text-sm">错因
            <select aria-label="本次错因" value={reason} onChange={e => setReason(e.target.value as ErrorReason)} className="h-9 flex-1 rounded-md border border-border bg-surface px-2">{ERROR_REASONS.map(r => <option key={r} value={r}>{r === "unknown" ? "未分类" : ERROR_REASON_LABEL[r]}</option>)}</select>
          </label> : null}
        </fieldset>
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => changeOpen(false)}>取消</Button><Button type="submit" disabled={busy || !outcome}>{busy ? "保存中…" : "保存记录"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function PracticeRecord({ problem }: { problem: Problem }) {
  const undo = useProblemStore(s => s.undoReview);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const entries = problem.practiceHistory?.entries ?? [];
  async function undoLast() {
    if (pending.current || !entries.length) return;
    pending.current = true; setBusy(true);
    try {
      await undo(problem.id, entries[entries.length - 1].id);
      toast.success("已撤销最近一次练习");
    } catch (error) { toast.error(error instanceof Error ? error.message : "记录失败，请重试"); }
    finally { pending.current = false; setBusy(false); }
  }
  if (!entries.length) return null;
  return <section aria-label="练习记录" className="space-y-3 border-y border-border py-4">
    <div className="flex flex-wrap items-center gap-3"><h3 className="text-sm font-semibold">练习记录</h3>{entries.length ? <PracticeSummary problem={problem} /> : null}</div>
    {entries.length ? <details><summary className="cursor-pointer text-sm">查看 {entries.length} 次练习记录</summary>
      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">{[...entries].reverse().map(entry => <div key={entry.id} className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border py-2"><time className="text-muted-foreground">{new Date(entry.at).toLocaleString("zh-CN")}</time><span>{OUTCOME_LABEL[entry.outcome]}</span>{entry.outcome !== "correct" && entry.errorReason !== "unknown" ? <span>{ERROR_REASON_LABEL[entry.errorReason]}</span> : null}</div>)}</div>
      <Button className="mt-2" size="sm" variant="outline" disabled={busy} onClick={() => void undoLast()}>撤销最近一次记录</Button>
    </details> : null}
  </section>;
}
