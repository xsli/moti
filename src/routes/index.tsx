import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera, ChevronRight, Download, FolderOpen, GripVertical, LayoutGrid, List, LoaderCircle, Pencil, Plus, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { type PointerEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CollectionPicker } from "@/components/notebook/collection-picker";
import { DateMenu, DifficultyMenu, FilterMenu } from "@/components/notebook/filter-menu";
import { SortableProblems } from "@/components/notebook/sortable-problems";
import { ProblemNavigationScope } from "@/components/notebook/problem-navigation";
import { TagEditor, type TagEditorHandle } from "@/components/notebook/tag-editor";
import { TagFilter } from "@/components/notebook/tag-filter";
import { BasketBar } from "@/components/paper/basket-bar";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
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
import {
  COLLECTION_KIND_LABEL,
  COLLECTION_KINDS,
  UNGROUPED_FOLDER,
  defaultCollectionName,
  sortCollectionsByOrder,
  type Collection,
  type CollectionKind,
} from "@/lib/problems/collections";
import { idsInSourceOrder, moveId, sortBySourceOrder, spliceVisibleOrder } from "@/lib/problems/order";
import { applyTagChanges, matchesAllTags } from "@/lib/problems/tags";
import { matchesDateFilter, type DateFilter } from "@/lib/problems/dates";
import { solveProblem } from "@/lib/ai/extract";
import { usePaperStore } from "@/lib/paper/store";
import { selectDueProblems, useProblemStore } from "@/lib/problems/store";
import { MASTERY_LABEL, SUBJECT_LABEL, SUBJECTS, type Mastery, type Problem, type Subject } from "@/lib/problems/types";
import { cn } from "@/lib/utils";
import { folderSummaries } from "@/lib/problems/folders";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { g?: string; f?: string } => {
    const g = typeof search.g === "string" ? search.g : "";
    if (g) return { g };
    return typeof search.f === "string" ? { f: search.f.trim() } : {};
  },
  component: Home,
});

type Filter = "all" | "due" | Subject;
type MasteryFilter = "all" | Mastery;
type BrowseLayout = "card" | "row";

const KIND_ORDER: CollectionKind[] = ["exam", "unit", "lesson", "custom"];
const LAYOUT_KEY = "moti-browse-layout";

function readLayout(): BrowseLayout {
  if (typeof window === "undefined") return "card";
  return window.localStorage.getItem(LAYOUT_KEY) === "row" ? "row" : "card";
}

function Home() {
  const { g = "", f } = Route.useSearch();
  const problems = useProblemStore((s) => s.problems);
  const collections = useProblemStore((s) => s.collections);
  const deleteCollection = useProblemStore((s) => s.deleteCollection);
  const addCollection = useProblemStore((s) => s.addCollection);
  const updateCollection = useProblemStore((s) => s.updateCollection);
  const renameFolder = useProblemStore((s) => s.renameFolder);
  const reorderProblems = useProblemStore((s) => s.reorderProblems);
  const reorderCollections = useProblemStore((s) => s.reorderCollections);
  const status = useProblemStore((s) => s.status);
  const error = useProblemStore((s) => s.error);
  const userId = useProblemStore((s) => s.userId);
  const hydrate = useProblemStore((s) => s.hydrate);
  const updateProblem = useProblemStore((s) => s.updateProblem);
  const deleteProblem = useProblemStore((s) => s.deleteProblem);
  const addToBasket = usePaperStore((s) => s.addToBasket);
  const importNotebook = useProblemStore((s) => s.importNotebook);
  const exportNotebook = useProblemStore((s) => s.exportNotebook);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [dateDay, setDateDay] = useState("");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [masteryFilter, setMasteryFilter] = useState<MasteryFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [tagOpen, setTagOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [masteryOpen, setMasteryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [folderRename, setFolderRename] = useState<{ from: string; to: string; others: number } | null>(null);
  const [batchTags, setBatchTags] = useState<string[]>([]);
  const [commonTags, setCommonTags] = useState<string[]>([]);
  const [batchGroupId, setBatchGroupId] = useState("");
  const [batchMastery, setBatchMastery] = useState<Mastery | "">("");
  const [batchSolveProgress, setBatchSolveProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [packing, setPacking] = useState(false);
  const [layout, setLayout] = useState<BrowseLayout>("card");
  const importRef = useRef<HTMLInputElement>(null);
  const batchTagEditorRef = useRef<TagEditorHandle>(null);

  useEffect(() => {
    setLayout(readLayout());
  }, []);

  useEffect(() => {
    setTagFilter([]);
    setMasteryFilter("all");
    setDifficultyFilter([]);
    setSelecting(false);
    setSelected(new Set());
  }, [g, f]);

  const overviewProblems = useMemo(() => {
    if (!g || g === "all") return problems;
    if (g === "ungrouped") return problems.filter((problem) => !problem.collectionId);
    return problems.filter((problem) => problem.collectionId === g);
  }, [g, problems]);
  const overviewDueCount = useMemo(
    () => selectDueProblems(overviewProblems).length,
    [overviewProblems],
  );
  const overviewMasteredCount = useMemo(
    () => overviewProblems.filter((problem) => problem.mastery === "mastered").length,
    [overviewProblems],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = problems.filter((p) => {
      if (g === "ungrouped" && p.collectionId) return false;
      if (g && g !== "all" && g !== "ungrouped" && p.collectionId !== g) return false;
      if (filter === "due") {
        if (p.mastery === "mastered" || p.nextReviewAt > Date.now()) return false;
      } else if (filter !== "all" && p.subject !== filter) {
        return false;
      }
      if (!matchesAllTags(p.tags, tagFilter)) return false;
      if (masteryFilter !== "all" && p.mastery !== masteryFilter) return false;
      if (difficultyFilter.length && !difficultyFilter.includes(p.difficulty)) return false;
      if (!matchesDateFilter(p.createdAt, dateFilter, dateDay)) return false;
      if (!q) return true;
      const hay = `${p.title} ${p.stem} ${p.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    if (g && g !== "all") return sortBySourceOrder(list);
    return list;
  }, [problems, filter, tagFilter, masteryFilter, difficultyFilter, query, dateFilter, dateDay, g]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const problem of problems) for (const tag of problem.tags) set.add(tag);
    return [...set];
  }, [problems]);

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "全部" },
    { id: "due", label: `待复习 ${overviewDueCount}` },
    ...SUBJECTS.map((s) => ({ id: s as Filter, label: SUBJECT_LABEL[s] })),
  ];
  const masteryOptions: { id: MasteryFilter; label: string }[] = [
    { id: "all", label: "全部状态" },
    ...(["new", "reviewing", "mastered"] as Mastery[]).map((id) => ({ id, label: MASTERY_LABEL[id] })),
  ];

  const selectedCount = selected.size;
  const currentCol = g && g !== "all" && g !== "ungrouped" ? collections.find((item) => item.id === g) : undefined;

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

  async function applyTags(nextTags = batchTags) {
    if (!selectedCount) return;
    const removed = commonTags.filter((t) => !nextTags.includes(t));
    const added = nextTags.filter((t) => !commonTags.includes(t));
    if (!removed.length && !added.length) {
      setTagOpen(false);
      return;
    }
    setBusy(true);
    try {
      for (const problem of problems) {
        if (!selected.has(problem.id)) continue;
        const tags = applyTagChanges(problem.tags, added, removed);
        await updateProblem(problem.id, { tags });
      }
      toast.success("标签已更新");
      setTagOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function applyGroup() {
    if (!selectedCount) return;
    setBusy(true);
    try {
      const nextId = batchGroupId || undefined;
      for (const problem of problems) {
        if (!selected.has(problem.id)) continue;
        if ((problem.collectionId || "") === (nextId || "")) continue;
        await updateProblem(problem.id, { collectionId: nextId });
      }
      const name = collections.find((item) => item.id === batchGroupId)?.name;
      toast.success(name ? `已改到「${name}」` : "已移到未分组");
      setGroupOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function applyMastery() {
    if (!selectedCount || !batchMastery) return;
    setBusy(true);
    try {
      for (const problem of problems) {
        if (!selected.has(problem.id) || problem.mastery === batchMastery) continue;
        await updateProblem(problem.id, { mastery: batchMastery });
      }
      toast.success(`已改为${MASTERY_LABEL[batchMastery]}`);
      setMasteryOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function solveSelected() {
    if (!selectedCount || batchSolveProgress) return;
    const targets = idsInSourceOrder(problems, selected)
      .map((id) => problems.find((problem) => problem.id === id))
      .filter((problem): problem is Problem => Boolean(problem));
    const pending = targets.filter((problem) => !problem.correctAnswer.trim() || !problem.analysis.trim());
    const skipped = targets.length - pending.length;

    if (!pending.length) {
      toast.info("选中的题目已有答案和解析");
      return;
    }

    let done = 0;
    let failed = 0;
    setBatchSolveProgress({ done, total: pending.length, failed });
    try {
      for (const problem of pending) {
        try {
          if (!problem.stem.trim()) {
            failed += 1;
            continue;
          }
          const result = await solveProblem({
            data: {
              stem: problem.stem,
              imageDataUrl: problem.figures[0]?.image || problem.sourceImage,
            },
          });
          if (!result.ok) {
            failed += 1;
            continue;
          }
          await updateProblem(problem.id, {
            correctAnswer: result.correctAnswer,
            analysis: result.analysis,
          });
        } catch {
          failed += 1;
        } finally {
          done += 1;
          setBatchSolveProgress({ done, total: pending.length, failed });
        }
      }

      const succeeded = pending.length - failed;
      const skippedText = skipped ? `，跳过已有答案 ${skipped} 道` : "";
      if (!failed) toast.success(`已生成 ${succeeded} 道题的答案和解析${skippedText}`);
      else if (succeeded) toast.warning(`已完成 ${succeeded} 道，${failed} 道未生成${skippedText}`);
      else toast.error(`这 ${failed} 道题暂时没有生成答案${skippedText}`);
    } finally {
      setBatchSolveProgress(null);
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

  async function downloadBackup() {
    setPacking(true);
    try {
      const text = await exportNotebook();
      const blob = new Blob([text], { type: "application/json" });
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `解集备份-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("已导出整本");
    } catch {
      toast.error("导出失败，请再试一次。");
    } finally {
      setPacking(false);
    }
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return;
    setPacking(true);
    try {
      const text = await file.text();
      const result = await importNotebook(text);
      toast.success(`已导入 ${result.problems} 道、${result.collections} 个分组`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败，请检查文件。");
    } finally {
      setPacking(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {f === undefined ? (
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-semibold">概览</h1>
          <div className="flex items-center">
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void onImportFile(file);
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => importRef.current?.click()}
              disabled={packing}
            >
              <Upload className="size-3.5" />
              导入
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => void downloadBackup()}
              disabled={packing}
            >
              <Download className="size-3.5" />
              {packing ? "打包中" : "导出"}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-4">
          <Stat label="收录" value={overviewProblems.length} />
          <Stat label="待复习" value={overviewDueCount} />
          <Stat label="已掌握" value={overviewMasteredCount} />
        </div>
      </section>
      ) : null}

      <BasketBar />

      {!g ? (
        <GroupHome
          key={f === undefined ? "home" : `folder:${f}`}
          folder={f}
          problems={problems}
          collections={collections}
          onCreate={async () => {
            const id = await addCollection({ name: defaultCollectionName(), kind: "exam", groupName: f ?? "" });
            navigate({ to: "/", search: { g: id } });
          }}
          onDelete={deleteCollection}
          onReorder={(ids) => void reorderCollections(ids)}
          onRenameFolder={(from, to) => {
            void renameFolder(from, to).then((n) => {
              toast.success(`已把 ${n} 个小组改到「${to || "未分大组"}」`);
              if (f !== undefined) void navigate({ to: "/", search: { f: to.trim().slice(0, 40) }, replace: true });
            });
          }}
        />
      ) : (
      <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/" search={currentCol ? { f: currentCol.groupName.trim() } : {}}>
              <ArrowLeft className="size-4" />
              {currentCol ? currentCol.groupName.trim() || UNGROUPED_FOLDER : "全部大组"}
            </Link>
          </Button>
          {g === "all" || g === "ungrouped" || !currentCol ? (
            <>
              <h2 className="font-display text-xl font-semibold">
                {g === "all" ? "全部题目" : g === "ungrouped" ? "未分组" : "分组"}
              </h2>
              <span className="text-sm text-muted-foreground">{visible.length} 道</span>
            </>
          ) : null}
          {currentCol ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button asChild size="sm">
                <Link to="/capture" search={{ g: currentCol.id }}>
                  <Camera className="size-4" />
                  拍题
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  navigate({
                    to: "/paper",
                    search: {
                      ids: idsInSourceOrder(
                        problems,
                        problems.filter((p) => p.collectionId === g).map((p) => p.id),
                      ).join(","),
                      tpl: "",
                      title: currentCol.name,
                      sheet: currentCol.kind === "exam" ? "exam" : "handout",
                    },
                  })
                }
              >
                本组组卷
              </Button>
            </div>
          ) : null}
        </div>
        {currentCol ? (
          <CollectionIdentity
            name={currentCol.name}
            groupName={currentCol.groupName}
            kind={currentCol.kind}
            count={visible.length}
            suggestions={collections.map((item) => item.groupName)}
            sortable={visible.length > 1}
            onPatch={(patch) => {
              if (patch.groupName != null && patch.groupName !== currentCol.groupName) {
                const others = collections.filter(
                  (item) => item.id !== currentCol.id && item.groupName === currentCol.groupName,
                ).length;
                if (currentCol.groupName.trim() && others > 0) {
                  setFolderRename({ from: currentCol.groupName, to: patch.groupName, others });
                  return;
                }
              }
              void updateCollection(currentCol.id, patch);
            }}
          />
        ) : null}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索题干、标签…"
              className="pl-9"
              aria-label="搜索题目"
            />
          </div>
          <Button
            variant={selecting ? "secondary" : "outline"}
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}
          >
            {selecting ? "取消" : "选择"}
          </Button>
          <div className="flex rounded-lg bg-secondary p-0.5">
            <button
              type="button"
              aria-label="卡片"
              className={cn("grid size-9 place-items-center rounded-md", layout === "card" && "bg-surface text-fg")}
              onClick={() => {
                setLayout("card");
                window.localStorage.setItem(LAYOUT_KEY, "card");
              }}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              aria-label="列表"
              className={cn("grid size-9 place-items-center rounded-md", layout === "row" && "bg-surface text-fg")}
              onClick={() => {
                setLayout("row");
                window.localStorage.setItem(LAYOUT_KEY, "row");
              }}
            >
              <List className="size-4" />
            </button>
          </div>
        </div>
        {selecting ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-fg"
              onClick={() => setSelected(new Set(visible.map((p) => p.id)))}
              disabled={!visible.length}
            >
              全部选中
            </button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-fg"
              onClick={() => setSelected(new Set())}
              disabled={!selectedCount}
            >
              全部不选
            </button>
            <span className="text-sm text-muted-foreground">已选 {selectedCount}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedCount}
                onClick={() => {
                  const n = addToBasket(idsInSourceOrder(problems, selected));
                  toast.success(n ? `已放入组卷篮 ${n} 道` : "这些题已在篮子里");
                }}
              >
                加入组卷篮
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedCount}
                onClick={() =>
                  navigate({ to: "/paper", search: { ids: idsInSourceOrder(problems, selected).join(","), tpl: "" } })
                }
              >
                组卷
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedCount || busy || Boolean(batchSolveProgress)}
                onClick={() => void solveSelected()}
              >
                {batchSolveProgress ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {batchSolveProgress
                  ? `AI答题 ${batchSolveProgress.done}/${batchSolveProgress.total}`
                  : "AI答题"}
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
                disabled={!selectedCount}
                onClick={() => {
                  const ids = problems.filter((p) => selected.has(p.id)).map((p) => p.collectionId || "");
                  const same = ids.length && ids.every((id) => id === ids[0]);
                  setBatchGroupId(same ? ids[0] : "");
                  setGroupOpen(true);
                }}
              >
                修改分组
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedCount}
                onClick={() => {
                  const states = problems.filter((p) => selected.has(p.id)).map((p) => p.mastery);
                  const same = states.length > 0 && states.every((mastery) => mastery === states[0]);
                  setBatchMastery(same ? states[0] : "");
                  setMasteryOpen(true);
                }}
              >
                改掌握状态
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
        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu
            idleLabel="科目"
            emptyValue={"all" as Filter}
            value={filter}
            options={chips}
            onChange={setFilter}
          />
          <TagFilter tags={allTags} value={tagFilter} onChange={setTagFilter} />
          <FilterMenu
            idleLabel="掌握状态"
            emptyValue="all"
            value={masteryFilter}
            options={masteryOptions}
            onChange={setMasteryFilter}
          />
          <DifficultyMenu value={difficultyFilter} onChange={setDifficultyFilter} />
          <DateMenu
            value={dateFilter}
            day={dateDay}
            onChange={(next, day) => {
              setDateFilter(next);
              setDateDay(day);
            }}
          />
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
            <Link to="/capture" search={currentCol ? { g: currentCol.id } : {}}>
              拍题
            </Link>
          </Button>
        </div>
      ) : (
        <ProblemSections
          problems={visible}
          collections={collections}
          groupBy={g === "all" ? "collection" : "none"}
          layout={layout}
          selecting={selecting}
          selected={selected}
          onToggle={toggle}
          onMasteryChange={(id, mastery) => void updateProblem(id, { mastery })}
          onReorder={
            currentCol
              ? (visibleIds) => {
                  const full = idsInSourceOrder(
                    problems,
                    problems.filter((p) => p.collectionId === currentCol.id).map((p) => p.id),
                  );
                  const merged = spliceVisibleOrder(
                    full,
                    visible.map((p) => p.id),
                    visibleIds,
                  );
                  void reorderProblems(merged);
                }
              : undefined
          }
        />
      )}

      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>改标签</DialogTitle>
            <DialogDescription>
              {selectedCount} 道题共有的标签。点一下去掉，输入新的会加到每一道上。
            </DialogDescription>
          </DialogHeader>
          <TagEditor ref={batchTagEditorRef} tags={batchTags} onChange={setBatchTags} suggestions={allTags} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagOpen(false)}>
              取消
            </Button>
            <Button
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void applyTags(batchTagEditorRef.current?.commitDraft() ?? batchTags)}
              disabled={busy}
            >
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改分组</DialogTitle>
            <DialogDescription>把已选的 {selectedCount} 道题放到同一组，或移到未分组。</DialogDescription>
          </DialogHeader>
          <CollectionPicker value={batchGroupId} onChange={setBatchGroupId} label="放到" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void applyGroup()} disabled={busy}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={masteryOpen} onOpenChange={setMasteryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改掌握状态</DialogTitle>
            <DialogDescription>把已选的 {selectedCount} 道题统一改为：</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {(["new", "reviewing", "mastered"] as Mastery[]).map((mastery) => (
              <Button
                key={mastery}
                type="button"
                variant={batchMastery === mastery ? "default" : "outline"}
                aria-pressed={batchMastery === mastery}
                onClick={() => setBatchMastery(mastery)}
              >
                {MASTERY_LABEL[mastery]}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMasteryOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void applyMastery()} disabled={busy || !batchMastery}>
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
      <Dialog open={Boolean(folderRename)} onOpenChange={(open) => !open && setFolderRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>同步改大组？</DialogTitle>
            <DialogDescription>
              「{folderRename?.from}」下还有 {folderRename?.others} 个小组。一起改成「{folderRename?.to || "未分大组"}」，还是只改当前这组？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setFolderRename(null)}>
              取消
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!currentCol || !folderRename) return;
                void updateCollection(currentCol.id, { groupName: folderRename.to });
                setFolderRename(null);
              }}
            >
              只改这一组
            </Button>
            <Button
              onClick={() => {
                if (!folderRename) return;
                void renameFolder(folderRename.from, folderRename.to).then((n) => {
                  toast.success(`已把 ${n} 个小组放到「${folderRename.to || "未分大组"}」`);
                });
                setFolderRename(null);
              }}
            >
              全部一起改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    )}
    </div>
  );
}

function ProblemSections({
  problems,
  collections,
  groupBy,
  layout,
  selecting,
  selected,
  onToggle,
  onMasteryChange,
  onReorder,
}: {
  problems: Problem[];
  collections: { id: string; name: string }[];
  groupBy: "collection" | "none";
  layout: BrowseLayout;
  selecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onMasteryChange: (id: string, mastery: Mastery) => void;
  onReorder?: (ids: string[]) => void;
}) {
  const sections = useMemo(() => {
    if (groupBy === "none") return [];
    const named = collections
      .map((item) => ({
        key: item.id,
        title: item.name,
        items: sortBySourceOrder(problems.filter((p) => p.collectionId === item.id)),
      }))
      .filter((section) => section.items.length);
    const loose = problems.filter((p) => !p.collectionId);
    return loose.length
      ? [...named, { key: "ungrouped", title: "未分组", items: sortBySourceOrder(loose) }]
      : named;
  }, [groupBy, collections, problems]);

  if (sections.length <= 1) {
    return (
      <ProblemNavigationScope ids={problems.map((problem) => problem.id)}>
      <SortableProblems
        problems={problems}
        layout={layout}
        selecting={selecting}
        selected={selected}
        onToggle={onToggle}
        onMasteryChange={onMasteryChange}
        onReorder={onReorder}
      />
      </ProblemNavigationScope>
    );
  }

  return (
    <ProblemNavigationScope ids={sections.flatMap((section) => section.items.map((problem) => problem.id))}>
    <div className="flex flex-col gap-8">
      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-base font-semibold">{section.title}</h3>
            <span className="text-xs text-muted-foreground">{section.items.length}</span>
          </div>
          <SortableProblems
            problems={section.items}
            layout={layout}
            selecting={selecting}
            selected={selected}
            onToggle={onToggle}
            onMasteryChange={onMasteryChange}
          />
        </section>
      ))}
    </div>
    </ProblemNavigationScope>
  );
}

function GroupHome({
  folder,
  problems,
  collections,
  onCreate,
  onDelete,
  onReorder,
  onRenameFolder,
}: {
  folder?: string;
  problems: Problem[];
  collections: Collection[];
  onCreate: () => void;
  onDelete: (id: string) => void | Promise<void>;
  onReorder: (ids: string[]) => void;
  onRenameFolder: (from: string, to: string) => void;
}) {
  const [query, setQuery] = useState("");
  const summaries = useMemo(() => folderSummaries(collections, problems), [collections, problems]);
  const q = query.trim().toLowerCase();
  const inFolder = folder !== undefined;
  const folderCollections = collections.filter((item) => item.groupName.trim() === folder);
  const filtered = folderCollections.filter((item) => item.name.toLowerCase().includes(q));
  const ungrouped = problems.filter((p) => !p.collectionId);
  const summary = summaries.find((item) => item.name === folder);
  const latestDates = useMemo(() => {
    const dates = new Map<string, number>();
    for (const problem of problems) {
      if (problem.collectionId) dates.set(problem.collectionId, Math.max(dates.get(problem.collectionId) ?? 0, problem.createdAt));
    }
    return dates;
  }, [problems]);
  const clusters = KIND_ORDER.map((kind) => ({
    kind,
    items: sortCollectionsByOrder(
      filtered.filter((item) => item.kind === kind),
      (item) => latestDates.get(item.id) ?? 0,
    ),
  })).filter((cluster) => cluster.items.length);
  const visibleFolders = summaries.filter((item) => (item.name || UNGROUPED_FOLDER).toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-5">
      {inFolder ? (
        <>
          <nav aria-label="分组路径">
            <Button asChild variant="ghost" size="sm">
              <Link to="/" search={{}}><ArrowLeft className="size-4" />全部大组</Link>
            </Button>
          </nav>
          <FolderHeading
            name={folder}
            summary={summary ?? { total: 0, due: 0, mastered: 0 }}
            onRename={(next) => onRenameFolder(folder, next)}
          />
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={inFolder ? "搜索本组小组…" : "搜索大组…"}
            aria-label={inFolder ? "搜索本组小组" : "搜索大组"}
            className="pl-9"
          />
        </div>
        <Button size="icon" variant="outline" title="新建小组" aria-label="新建小组" onClick={onCreate}>
          <Plus className="size-4" />
        </Button>
        {!inFolder ? (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Button asChild variant="ghost" size="sm">
              <Link to="/" search={{ g: "all" }}>全部题目 {problems.length}<ChevronRight className="size-4" /></Link>
            </Button>
            {ungrouped.length ? (
              <Button asChild variant="ghost" size="sm">
                <Link to="/" search={{ g: "ungrouped" }}>未分组 {ungrouped.length}<ChevronRight className="size-4" /></Link>
              </Button>
            ) : null}
          </div>
        ) : <span className="ml-auto text-sm text-muted-foreground">{q ? filtered.length : folderCollections.length} 个小组</span>}
      </div>
      {!inFolder ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleFolders.map((item) => {
            const percent = item.total ? Math.round(item.mastered / item.total * 100) : 0;
            return (
              <Link key={item.name} to="/" search={{ f: item.name }}
                className="group flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-primary">
                <div className="flex items-start gap-3">
                  <FolderOpen className="mt-1 size-5 shrink-0 text-primary" />
                  <h2 className="min-w-0 flex-1 break-words text-lg font-semibold">{item.name || UNGROUPED_FOLDER}</h2>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>{item.groups} 个小组</span><span>{item.total} 道题</span>
                </div>
                <div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>待复习 {item.due} · 已掌握 {item.mastered}</span>
                    <span className="tabular-nums">掌握率 {percent}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule">
                    <div className="h-full rounded-full bg-mastered" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : clusters.map((cluster) => (
        <section key={cluster.kind} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{COLLECTION_KIND_LABEL[cluster.kind]}</h3>
          <CollectionList items={cluster.items} problems={problems} onDelete={onDelete} onReorder={q ? undefined : onReorder} />
        </section>
      ))}
      {(inFolder ? !filtered.length : !visibleFolders.length) ? (
        <div className="py-12 text-center">
          <FolderOpen className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {q ? "没有匹配的分组" : inFolder ? "这个大组还没有小组" : "还没有大组"}
          </p>
          {!q ? <Button className="mt-4" variant="outline" onClick={onCreate}><Plus className="size-4" />新建小组</Button> : null}
        </div>
      ) : null}
    </div>
  );
}

function CollectionList({
  items,
  problems,
  onDelete,
  onReorder,
}: {
  items: Collection[];
  problems: Problem[];
  onDelete: (id: string) => void | Promise<void>;
  onReorder?: (ids: string[]) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const sortable = Boolean(onReorder) && items.length > 1;

  function dropIndex(clientY: number) {
    const nodes = [...(listRef.current?.querySelectorAll("[data-collection-row]") ?? [])];
    const index = nodes.findIndex((node) => {
      const box = node.getBoundingClientRect();
      return clientY < box.top + box.height / 2;
    });
    return index < 0 ? nodes.length : index;
  }

  function onGripPointerDown(event: PointerEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
    setOverIndex(items.findIndex((item) => item.id === id));
  }

  function onGripPointerUp() {
    if (draggingId && overIndex != null && onReorder) {
      const from = items.findIndex((item) => item.id === draggingId);
      onReorder(moveId(items.map((item) => item.id), from, overIndex));
    }
    setDraggingId(null);
    setOverIndex(null);
  }

  return (
    <div ref={listRef} className="border-y border-border">
      <div aria-hidden className="hidden grid-cols-[2rem_minmax(0,1fr)_4rem_5rem_9rem_2rem] items-center gap-3 border-b border-border py-2 text-xs text-muted-foreground sm:grid">
        <span /><span>小组</span><span className="text-right">题数</span><span className="text-right">待复习</span><span className="text-right">掌握比例</span><span />
      </div>
      {items.map((item, index) => {
        const groupProblems = problems.filter((problem) => problem.collectionId === item.id);
        const count = groupProblems.length;
        const due = selectDueProblems(groupProblems).length;
        const mastered = groupProblems.filter((problem) => problem.mastery === "mastered").length;
        const percent = count ? Math.round(mastered / count * 100) : 0;
        return (
          <div key={item.id} data-collection-row={item.id}
            className={cn(
              "relative flex items-center gap-2 border-b border-border py-1 last:border-b-0 hover:bg-secondary/30 sm:gap-3",
              draggingId === item.id && "opacity-60",
              draggingId && overIndex === index && "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary",
              draggingId && overIndex === items.length && index === items.length - 1 && "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
            )}>
            <button type="button" disabled={!sortable} aria-label={`拖动${item.name}排序`} title="拖动排序"
              className="grid size-8 shrink-0 touch-none place-items-center rounded-md text-muted-foreground hover:bg-secondary active:cursor-grabbing disabled:invisible"
              onPointerDown={(event) => onGripPointerDown(event, item.id)}
              onPointerMove={(event) => { if (draggingId) setOverIndex(dropIndex(event.clientY)); }}
              onPointerUp={onGripPointerUp}
              onPointerCancel={() => { setDraggingId(null); setOverIndex(null); }}>
              <GripVertical className="size-4" />
            </button>
            <Link to="/" search={{ g: item.id }}
              className="grid min-w-0 flex-1 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-3 focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[minmax(0,1fr)_4rem_5rem_9rem]">
              <span className="col-span-3 break-words text-base font-medium sm:col-span-1">{item.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground sm:text-right sm:text-sm">{count}<span className="sm:hidden"> 道</span><span className="sr-only hidden sm:inline"> 道题</span></span>
              <span className="text-xs tabular-nums text-muted-foreground sm:text-right sm:text-sm"><span className="sm:hidden">待复习 </span><span className="sr-only hidden sm:inline">待复习 </span>{due}</span>
              <span className="min-w-0">
                <span className="mb-1 flex justify-end gap-1 text-xs tabular-nums text-muted-foreground"><span className="sr-only">已掌握 </span>{mastered}/{count} · {percent}%</span>
                <span className="block h-1 overflow-hidden rounded-full bg-rule">
                  <span className="block h-full rounded-full bg-mastered" style={{ width: `${percent}%` }} />
                </span>
              </span>
            </Link>
            <ConfirmAction title={`删除分组“${item.name}”？`}
              description={count ? `组内 ${count} 道题会保留并移至“未分组”。分组删除后无法恢复。` : "这是一个空分组，删除后无法恢复。"}
              onConfirm={() => onDelete(item.id)}>
              <Button type="button" variant="ghost" size="icon" title="删除小组" aria-label={`删除${item.name}`}
                className="size-8 min-h-8 shrink-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="size-3.5" />
              </Button>
            </ConfirmAction>
          </div>
        );
      })}
    </div>
  );
}

function FolderHeading({
  name,
  summary,
  onRename,
}: {
  name: string;
  summary: { total: number; due: number; mastered: number };
  onRename: (next: string) => void;
}) {
  const [text, setText] = useState(name);
  const [editing, setEditing] = useState(false);
  const masteryPercent = summary.total ? Math.round((summary.mastered / summary.total) * 100) : 0;
  useEffect(() => {
    setText(name);
  }, [name]);

  function commit() {
    const next = text.trim();
    setEditing(false);
    if (next !== name) onRename(next);
    else setText(name);
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setText(name);
              setEditing(false);
            }
          }}
          placeholder={UNGROUPED_FOLDER}
          maxLength={40}
          className="h-9 max-w-xs font-display text-base font-semibold"
          aria-label="大组名称"
        />
        <Button size="sm" onClick={commit}>
          保存
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setText(name);
            setEditing(false);
          }}
        >
          取消
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="break-words font-display text-xl font-semibold">{name || UNGROUPED_FOLDER}</h1>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 min-h-7 shrink-0 text-muted-foreground"
          aria-label="改名"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3.5" />
        </Button>
      </div>
      <div className="w-full min-w-0 max-w-sm basis-full pt-0.5 sm:min-w-64 sm:flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>共 {summary.total} 道</span>
          <span>待复习 {summary.due}</span>
          <span>已掌握 {summary.mastered}</span>
          <span className="ml-auto tabular-nums">{masteryPercent}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-rule">
          <div
            className="h-full rounded-full bg-mastered transition-[width]"
            style={{ width: `${masteryPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function CollectionIdentity({
  name,
  groupName,
  kind,
  count,
  suggestions,
  sortable,
  onPatch,
}: {
  name: string;
  groupName: string;
  kind: CollectionKind;
  count: number;
  suggestions: string[];
  sortable?: boolean;
  onPatch: (patch: { name?: string; groupName?: string; kind?: CollectionKind }) => void;
}) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3 shadow-[var(--shadow-border)]">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)] sm:items-end">
        <RenameField
          label="大组"
          value={groupName}
          placeholder="例如华杯真题"
          suggestions={suggestions}
          onCommit={(next) => onPatch({ groupName: next })}
        />
        <p className="hidden pb-2 text-lg text-muted-foreground/50 sm:block" aria-hidden>
          /
        </p>
        <RenameField
          label="小组"
          value={name}
          placeholder="例如 2025dly"
          required
          onCommit={(next) => onPatch({ name: next })}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {COLLECTION_KINDS.map((item) => (
          <button
            key={item}
            type="button"
            className={cn(
              "h-7 rounded-full px-2.5 text-xs transition-colors",
              kind === item ? "bg-fg text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-fg",
            )}
            onClick={() => {
              if (item !== kind) onPatch({ kind: item });
            }}
          >
            {COLLECTION_KIND_LABEL[item]}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {count} 道{sortable ? " · 按住左上角横条可改顺序" : ""}
        </span>
      </div>
    </div>
  );
}

function RenameField({
  label,
  value,
  placeholder,
  suggestions = [],
  required,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder: string;
  suggestions?: string[];
  required?: boolean;
  onCommit: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const listId = useId();
  useEffect(() => {
    setText(value);
  }, [value]);
  const names = [...new Set(suggestions.map((item) => item.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "zh"),
  );

  function commit() {
    const next = text.trim();
    if (required && !next) {
      setText(value);
      return;
    }
    if (next !== value) onCommit(next);
  }

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] tracking-wider text-muted-foreground">{label}</span>
      <input
        value={text}
        list={names.length ? listId : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        placeholder={placeholder}
        className={cn(
          "h-10 min-w-0 rounded-lg bg-secondary/80 px-3 text-sm text-fg outline-none ring-0 transition-shadow",
          "placeholder:text-muted-foreground/70 focus:bg-bg focus:shadow-[var(--shadow-border)]",
        )}
      />
      {names.length ? (
        <datalist id={listId}>
          {names.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      ) : null}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-display text-lg font-semibold tabular-nums text-fg">{value}</span>
    </div>
  );
}
