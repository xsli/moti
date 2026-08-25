import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { ProblemCard } from "@/components/notebook/problem-card";
import { TagEditor } from "@/components/notebook/tag-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { matchesDateFilter, type DateFilter } from "@/lib/problems/dates";
import { selectDueProblems, useProblemStore } from "@/lib/problems/store";
import { SUBJECT_LABEL, SUBJECTS, type Subject } from "@/lib/problems/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

type Filter = "all" | "due" | Subject;

function Home() {
  const problems = useProblemStore((s) => s.problems);
  const status = useProblemStore((s) => s.status);
  const error = useProblemStore((s) => s.error);
  const userId = useProblemStore((s) => s.userId);
  const hydrate = useProblemStore((s) => s.hydrate);
  const updateProblem = useProblemStore((s) => s.updateProblem);
  const deleteProblem = useProblemStore((s) => s.deleteProblem);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [dateDay, setDateDay] = useState("");
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [tagOpen, setTagOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [batchTags, setBatchTags] = useState<string[]>([]);
  const [commonTags, setCommonTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const dueCount = useMemo(() => selectDueProblems(problems).length, [problems]);
  const masteredCount = useMemo(
    () => problems.filter((p) => p.mastery === "mastered").length,
    [problems],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return problems.filter((p) => {
      if (filter === "due") {
        if (p.mastery === "mastered" || p.nextReviewAt > Date.now()) return false;
      } else if (filter !== "all" && p.subject !== filter) {
        return false;
      }
      if (!matchesDateFilter(p.createdAt, dateFilter, dateDay)) return false;
      if (!q) return true;
      const hay = `${p.title} ${p.stem} ${p.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [problems, filter, query, dateFilter, dateDay]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const problem of problems) for (const tag of problem.tags) set.add(tag);
    return [...set];
  }, [problems]);

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "due", label: `待复习 ${dueCount}` },
    ...SUBJECTS.map((s) => ({ id: s as Filter, label: SUBJECT_LABEL[s] })),
  ];

  const selectedCount = selected.size;
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  async function applyTags() {
    if (!selectedCount) return;
    const removed = commonTags.filter((t) => !batchTags.includes(t));
    const added = batchTags.filter((t) => !commonTags.includes(t));
    if (!removed.length && !added.length) {
      setTagOpen(false);
      return;
    }
    setBusy(true);
    try {
      for (const problem of problems) {
        if (!selected.has(problem.id)) continue;
        const tags = [
          ...problem.tags.filter((t) => !removed.includes(t)),
          ...added.filter((t) => !problem.tags.includes(t)),
        ].slice(0, 8);
        await updateProblem(problem.id, { tags });
      }
      toast.success("标签已更新");
      setTagOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    setBusy(true);
    try {
      for (const id of selected) {
        await deleteProblem(id);
      }
      toast.success(`已删除 ${selectedCount} 道`);
      setDeleteOpen(false);
      exitSelect();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <Logo />
        <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
          <Stat label="收录" value={problems.length} />
          <Stat label="待复习" value={dueCount} />
          <Stat label="已掌握" value={masteredCount} />
        </div>
      </section>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索题干、标签…"
              className="pl-9"
              aria-label="搜索错题"
            />
          </div>
          <Button
            variant={selecting ? "secondary" : "outline"}
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}
          >
            {selecting ? "取消" : "选择"}
          </Button>
        </div>
        {selecting ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-fg"
              onClick={() => {
                if (allVisibleSelected) {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const p of visible) next.delete(p.id);
                    return next;
                  });
                } else {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const p of visible) next.add(p.id);
                    return next;
                  });
                }
              }}
            >
              {allVisibleSelected ? "取消全选" : "全选"}
            </button>
            <span className="text-sm text-muted-foreground">已选 {selectedCount}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedCount}
                onClick={() =>
                  navigate({ to: "/paper", search: { ids: [...selected].join(",") } })
                }
              >
                组卷
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedCount}
                onClick={() => {
                  const lists = problems.filter((p) => selected.has(p.id)).map((p) => p.tags);
                  const common = lists.length
                    ? lists.reduce((a, b) => a.filter((t) => b.includes(t)))
                    : [];
                  setCommonTags(common);
                  setBatchTags(common);
                  setTagOpen(true);
                }}
              >
                改标签
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={!selectedCount}
                onClick={() => setDeleteOpen(true)}
              >
                删除
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={cn(
                "h-9 shrink-0 rounded-full px-3.5 text-sm transition-colors",
                filter === chip.id
                  ? "bg-fg text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-fg",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "全部日期"],
              ["today", "今天"],
              ["7d", "近7天"],
              ["30d", "近30天"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setDateFilter(id);
                setDateDay("");
              }}
              className={cn(
                "h-9 shrink-0 rounded-full px-3.5 text-sm transition-colors",
                dateFilter === id
                  ? "bg-fg text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
          <label className="inline-flex h-9 items-center rounded-full bg-secondary px-3 text-sm text-muted-foreground">
            <span className="sr-only">按某一天筛选</span>
            <input
              type="date"
              value={dateFilter === "day" ? dateDay : ""}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) {
                  setDateFilter("all");
                  setDateDay("");
                  return;
                }
                setDateDay(value);
                setDateFilter("day");
              }}
              className="bg-transparent text-sm text-fg outline-none"
            />
          </label>
        </div>
      </div>

      {status === "error" ? (
        <div className="rounded-xl bg-surface px-6 py-12 text-center shadow-[var(--shadow-border)]">
          <p className="font-display text-xl font-semibold">本子还没同步上来</p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-6" onClick={() => userId && void hydrate(userId)}>
            再试一次
          </Button>
        </div>
      ) : status !== "ready" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl bg-surface px-6 py-16 text-center shadow-[var(--shadow-border)]">
          <p className="font-display text-xl font-semibold">还没有这类题目</p>
          <Button asChild className="mt-6">
            <Link to="/capture">拍下错题</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((problem) => (
            <ProblemCard
              key={problem.id}
              problem={problem}
              selecting={selecting}
              selected={selected.has(problem.id)}
              onToggle={() => toggle(problem.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>改标签</DialogTitle>
            <DialogDescription>
              {selectedCount} 道题共有的标签。点一下去掉，输入新的会加到每一道上。
            </DialogDescription>
          </DialogHeader>
          <TagEditor tags={batchTags} onChange={setBatchTags} suggestions={allTags} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void applyTags()} disabled={busy}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除 {selectedCount} 道题？</DialogTitle>
            <DialogDescription>删除后无法恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void removeSelected()} disabled={busy}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-semibold tabular-nums text-fg">{value}</div>
    </div>
  );
}
