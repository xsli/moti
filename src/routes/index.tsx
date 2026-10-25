import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Database, Download, FolderOpen, GripVertical, LayoutGrid, List, LoaderCircle, Pencil, Plus, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { type PointerEvent, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { KnowledgeLink } from "@/components/notebook/knowledge-link";
import { CollectionPicker } from "@/components/notebook/collection-picker";
import { DateMenu, DifficultyMenu, FilterMenu, dateFilterLabel } from "@/components/notebook/filter-menu";
import { SortableProblems } from "@/components/notebook/sortable-problems";
import { ProblemNavigationScope } from "@/components/notebook/problem-navigation";
import { TagEditor, type TagEditorHandle } from "@/components/notebook/tag-editor";
import { TagFilter } from "@/components/notebook/tag-filter";
import { ExtraFilters } from "@/components/notebook/extra-filters";
import { BasketBar } from "@/components/paper/basket-bar";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { MASTERY_VALUES, MASTERY_LABEL, SUBJECT_LABEL, SUBJECTS, type Mastery, type Problem, type Subject } from "@/lib/problems/types";
import { cn } from "@/lib/utils";
import { folderSummaries } from "@/lib/problems/folders";
import { BookExportDialog } from "@/components/paper/book-export-dialog";
import { orderBrowseProblems } from "@/lib/problems/browse";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { g?: string; f?: string } => {
    const g = typeof search.g === "string" ? search.g : "";
    if (g) return { g };
    return typeof search.f === "string" ? { f: search.f.trim() } : {};
  },
  component: Home,
});

type Filter = "all" | "due" | Subject;
import { matchesErrorFilter, practiceStats, type ErrorFilter } from "@/lib/problems/review";

type MasteryFilter = "all" | Mastery;
type BrowseLayout = "card" | "row";
type CollectionIdentityPatch = Partial<Pick<Collection, "name" | "groupName" | "kind">>;

const KIND_ORDER: CollectionKind[] = ["exam", "unit", "lesson", "custom"];
const LAYOUT_KEY = "moti-browse-layout";
const BROWSE_PAGE_SIZE = 24;

function readLayout(): BrowseLayout {
  if (typeof window === "undefined") return "card";
  const saved = window.localStorage.getItem(LAYOUT_KEY);
  return saved === "row" || (!saved && window.matchMedia("(max-width: 639px)").matches) ? "row" : "card";
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
  const [errorFilter, setErrorFilter] = useState<ErrorFilter>("all");
  const [errorSort, setErrorSort] = useState("default");
  const [masteryFilter, setMasteryFilter] = useState<MasteryFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searching = query !== deferredQuery;
  const [pagination, setPagination] = useState({ scope: "", page: 1 });
  const listTopRef = useRef<HTMLDivElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [tagOpen, setTagOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [masteryOpen, setMasteryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [folderRename, setFolderRename] = useState<{
    from: string; to: string; others: number; id: string; patch: CollectionIdentityPatch;
  } | null>(null);
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
    setErrorFilter("all");
    setErrorSort("default");
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
    const q = deferredQuery.trim().toLowerCase();
    const list = problems.filter((p) => {
      if (g === "ungrouped" && p.collectionId) return false;
      if (g && g !== "all" && g !== "ungrouped" && p.collectionId !== g) return false;
      if (filter === "due") {
        if (p.mastery === "mastered" || p.nextReviewAt > Date.now()) return false;
      } else if (filter !== "all" && p.subject !== filter) {
        return false;
      }
      if (!matchesAllTags(p.tags, tagFilter)) return false;
      if (!matchesErrorFilter(p, errorFilter)) return false;
      if (masteryFilter !== "all" && p.mastery !== masteryFilter) return false;
      if (difficultyFilter.length && !difficultyFilter.includes(p.difficulty)) return false;
      if (!matchesDateFilter(p.createdAt, dateFilter, dateDay)) return false;
      if (!q) return true;
      const hay = `${p.title} ${p.stem} ${p.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    if (g && g !== "all") return sortBySourceOrder(list);
    return list;
  }, [problems, filter, tagFilter, masteryFilter, errorFilter, difficultyFilter, deferredQuery, dateFilter, dateDay, g]);

  const paginated = g === "all" || g === "ungrouped";
  const orderedVisible = useMemo(
    () => {
      const ordered = g === "all" ? orderBrowseProblems(visible, collections.map((c) => c.id)) : visible;
      return errorSort === "errors" ? [...ordered].sort((a, b) => practiceStats(b).wrong - practiceStats(a).wrong) : ordered;
    },
    [visible, collections, g, errorSort],
  );
  const pageScope = JSON.stringify([g, f, filter, tagFilter, masteryFilter, errorFilter, errorSort, difficultyFilter, deferredQuery, dateFilter, dateDay]);
  const pageCount = paginated ? Math.max(1, Math.ceil(orderedVisible.length / BROWSE_PAGE_SIZE)) : 1;
  const currentPage = Math.min(pagination.scope === pageScope ? pagination.page : 1, pageCount);
  const pageStart = paginated ? (currentPage - 1) * BROWSE_PAGE_SIZE : 0;
  const pageItems = useMemo(
    () => paginated ? orderedVisible.slice(pageStart, pageStart + BROWSE_PAGE_SIZE) : orderedVisible,
    [paginated, orderedVisible, pageStart],
  );
  const navigationIds = useMemo(() => orderedVisible.map((p) => p.id), [orderedVisible]);
  const pageSelected = pageItems.length > 0 && pageItems.every((p) => selected.has(p.id));

  useEffect(() => {
    setPagination((previous) => {
      if (previous.scope !== pageScope) return { scope: pageScope, page: 1 };
      if (previous.page > pageCount) return { ...previous, page: pageCount };
      return previous;
    });
  }, [pageScope, pageCount]);

  function goToPage(page: number) {
    setPagination({ scope: pageScope, page: Math.max(1, Math.min(page, pageCount)) });
    listTopRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }

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
    ...MASTERY_VALUES.map((id) => ({ id, label: MASTERY_LABEL[id] })),
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
              imageDataUrl: problem.figures[0]?.originalImage || problem.figures[0]?.image || problem.sourceImage,
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
      toast.success("已备份全部题库数据");
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
      {!g && f === undefined ? (
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-semibold">题库</h1>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={packing || status !== "ready"}><Database />{packing ? "备份中…" : "数据管理"}</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void downloadBackup()}><Download />备份全部数据</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => importRef.current?.click()}><Upload />恢复备份</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
          onCreate={async (name, groupName) => {
            const id = await addCollection({ name, kind: "unit", groupName });
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
          <BackButton>
            <Link to="/" search={currentCol ? { f: currentCol.groupName.trim() } : {}} />
          </BackButton>
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
              <KnowledgeLink scope={{ collectionId: currentCol.id }} disabled={!overviewProblems.length} />
              <Button asChild size="sm" variant="outline">
                <Link to="/read/$id" params={{ id: currentCol.id }}>
                  阅读
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
                组卷
              </Button>
            </div>
          ) : null}
        </div>
        {currentCol ? (
          <>
          <CollectionIdentity
            key={currentCol.id}
            name={currentCol.name}
            groupName={currentCol.groupName}
            kind={currentCol.kind}
            suggestions={collections.map((item) => item.groupName)}
            onPatch={(patch) => {
              if (patch.groupName != null && patch.groupName !== currentCol.groupName) {
                const others = collections.filter(
                  (item) => item.id !== currentCol.id && item.groupName === currentCol.groupName,
                ).length;
                if (currentCol.groupName.trim() && others > 0) {
                  setFolderRename({ from: currentCol.groupName, to: patch.groupName, others, id: currentCol.id, patch });
                  return;
                }
              }
              void updateCollection(currentCol.id, patch);
            }}
          />
          <p className="text-xs text-muted-foreground">{overviewProblems.length} 道题 · 待复习 {overviewDueCount} · 已掌握 {overviewMasteredCount}</p>
          </>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative basis-full sm:min-w-0 sm:flex-1 sm:basis-auto">
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
            onClick={() => { setReordering(false); selecting ? exitSelect() : setSelecting(true); }}
          >
            {selecting ? "退出多选" : "多选"}
          </Button>
          {currentCol && !selecting ? <Button variant={reordering ? "secondary" : "ghost"} size="sm" aria-label={reordering ? "完成排序" : "调整题目顺序"} aria-pressed={reordering} onClick={() => setReordering(!reordering)}>{reordering ? "完成排序" : "调整顺序"}</Button> : null}
          <div className="ml-auto flex rounded-lg bg-secondary p-0.5 sm:ml-0">
            <button
              type="button"
              aria-label="卡片"
              aria-pressed={layout === "card"}
              title="卡片视图"
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
              aria-pressed={layout === "row"}
              title="列表视图"
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
              onClick={() => setSelected((previous) => {
                const next = new Set(previous);
                for (const item of pageItems) {
                  if (pageSelected) next.delete(item.id);
                  else next.add(item.id);
                }
                return next;
              })}
              disabled={!pageItems.length || searching}
            >
              {paginated ? (pageSelected ? "取消本页全选" : "全选本页") : (pageSelected ? "取消全选" : "全部选中")}
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
              <KnowledgeLink scope={{ problemIds: idsInSourceOrder(problems, selected) }} disabled={!selectedCount} />
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedCount}
                onClick={() => {
                  const n = addToBasket(idsInSourceOrder(problems, selected));
                  toast.success(n ? `已加入组卷篮 ${n} 道` : "题目已选中，或已达选题上限");
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
          <FilterMenu idleLabel="例题 / 习题" emptyValue="all" value={tagFilter.find((tag) => tag === "例题" || tag === "习题") || "all"}
            options={[{ id: "all", label: "全部题目" }, { id: "例题", label: "例题" }, { id: "习题", label: "习题" }]}
            onChange={(kind) => setTagFilter((tags) => [...tags.filter((tag) => tag !== "例题" && tag !== "习题"), ...(kind === "all" ? [] : [kind])])} />
          <FilterMenu
            idleLabel="当前状态"
            emptyValue="all"
            value={masteryFilter}
            options={masteryOptions}
            onChange={setMasteryFilter}
          />
          <FilterMenu idleLabel="错误记录" emptyValue="all" value={errorFilter}
            options={[{ id: "all", label: "全部错误记录" }, { id: "wrong", label: "错过的题（≥1次）" }, { id: "repeated", label: "反复出错（≥2次）" }, { id: "unknown", label: "历史次数未知" }]}
            onChange={setErrorFilter} />
          <FilterMenu idleLabel="排序" emptyValue="default" value={errorSort}
            options={[{ id: "default", label: "原有顺序" }, { id: "errors", label: "错误次数从多到少" }]}
            onChange={setErrorSort} />
          <ExtraFilters activeCount={Number(filter !== "all") + Number(dateFilter !== "all") + difficultyFilter.length + tagFilter.filter((tag) => tag !== "例题" && tag !== "习题").length}
            activeFilters={[
              ...(filter !== "all" ? [{ key: "subject", label: chips.find((chip) => chip.id === filter)?.label ?? filter, onRemove: () => setFilter("all") }] : []),
              ...(dateFilter !== "all" ? [{ key: "date", label: dateFilterLabel(dateFilter, dateDay), onRemove: () => { setDateFilter("all"); setDateDay(""); } }] : []),
              ...difficultyFilter.map((value) => ({ key: `difficulty:${value}`, label: `难度：${value}星`, onRemove: () => setDifficultyFilter((values) => values.filter((item) => item !== value)) })),
              ...tagFilter.filter((tag) => tag !== "例题" && tag !== "习题").map((tag) => ({ key: `tag:${tag}`, label: tag, onRemove: () => setTagFilter((tags) => tags.filter((item) => item !== tag)) })),
            ]}
            onClear={() => { setFilter("all"); setDateFilter("all"); setDateDay(""); setDifficultyFilter([]); setTagFilter((tags) => tags.filter((tag) => tag === "例题" || tag === "习题")); }}>
          <FilterMenu idleLabel="科目" emptyValue={"all" as Filter} value={filter} options={chips} onChange={setFilter} />
          <TagFilter tags={allTags.filter((tag) => tag !== "例题" && tag !== "习题")} value={tagFilter.filter((tag) => tag !== "例题" && tag !== "习题")} onChange={(tags) => setTagFilter((previous) => [...previous.filter((tag) => tag === "例题" || tag === "习题"), ...tags])} />
          <DifficultyMenu value={difficultyFilter} onChange={setDifficultyFilter} />
          <DateMenu
            value={dateFilter}
            day={dateDay}
            onChange={(next, day) => {
              setDateFilter(next);
              setDateDay(day);
            }}
          />
          </ExtraFilters>
        </div>
      </div>

      {paginated && status === "ready" ? (
        <nav ref={listTopRef} aria-label="题目分页" className="sticky top-14 z-10 flex scroll-mt-20 flex-wrap items-center justify-between gap-2 border-y border-border bg-surface px-3 py-2 sm:top-16">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {searching ? "筛选中…" : `共 ${orderedVisible.length} 道 · ${orderedVisible.length ? pageStart + 1 : 0}–${pageStart + pageItems.length}`}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="上一页" title="上一页" disabled={currentPage <= 1 || searching} onClick={() => goToPage(currentPage - 1)}><ChevronLeft /></Button>
            <select aria-label="页码" value={currentPage} disabled={!orderedVisible.length || searching} onChange={(e) => goToPage(Number(e.target.value))} className="h-9 rounded-md border border-border bg-surface px-2 text-sm">
              {Array.from({ length: pageCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} / {pageCount}</option>)}
            </select>
            <Button variant="ghost" size="icon" aria-label="下一页" title="下一页" disabled={currentPage >= pageCount || searching} onClick={() => goToPage(currentPage + 1)}><ChevronRight /></Button>
          </div>
        </nav>
      ) : null}

      {status === "error" ? (
        <div className="rounded-xl bg-surface px-6 py-12 text-center shadow-[var(--shadow-border)]">
          <p className="font-display text-xl font-semibold">题库尚未加载</p>
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
              录题
            </Link>
          </Button>
        </div>
      ) : (
        <ProblemSections
          problems={pageItems}
          navigationIds={navigationIds}
          collections={collections}
          groupBy={g === "all" && errorSort === "default" ? "collection" : "none"}
          layout={layout}
          selecting={selecting}
          selected={selected}
          onToggle={toggle}
          onMasteryChange={(id, mastery) => void updateProblem(id, { mastery })}
          onReorder={
            currentCol && reordering && errorSort === "default"
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
            {MASTERY_VALUES.map((mastery) => (
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
                if (!folderRename) return;
                void updateCollection(folderRename.id, folderRename.patch);
                setFolderRename(null);
              }}
            >
              只改这一组
            </Button>
            <Button
              onClick={() => {
                if (!folderRename) return;
                void renameFolder(folderRename.from, folderRename.to).then(async (n) => {
                  if (folderRename.patch.name != null || folderRename.patch.kind != null) {
                    await updateCollection(folderRename.id, folderRename.patch);
                  }
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
  navigationIds,
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
  navigationIds: string[];
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
        items: problems.filter((p) => p.collectionId === item.id),
      }))
      .filter((section) => section.items.length);
    const known = new Set(collections.map((item) => item.id));
    const loose = problems.filter((p) => !p.collectionId || !known.has(p.collectionId));
    return loose.length
      ? [...named, { key: "ungrouped", title: "未分组", items: loose }]
      : named;
  }, [groupBy, collections, problems]);

  if (sections.length <= 1) {
    return (
      <ProblemNavigationScope ids={navigationIds}>
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
    <ProblemNavigationScope ids={navigationIds}>
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
  onCreate: (name: string, groupName: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onReorder: (ids: string[]) => void;
  onRenameFolder: (from: string, to: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [newFolder, setNewFolder] = useState(folder ?? "");
  const [newName, setNewName] = useState("");
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
  const matchingGroups = !inFolder && q ? sortCollectionsByOrder(collections.filter((item) => `${item.groupName} ${item.name}`.toLowerCase().includes(q)), (item) => item.createdAt) : [];

  return (
    <div className="flex flex-col gap-5">
      {inFolder ? (
        <>
          <nav aria-label="分组路径" className="flex flex-wrap items-center justify-between gap-2">
            <BackButton><Link to="/" search={{}} /></BackButton>
            <BookExportDialog folder={folder} collections={collections} problems={problems} />
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
            placeholder={inFolder ? "搜索本组小组…" : "搜索大组、小组…"}
            aria-label={inFolder ? "搜索本组小组" : "搜索大组、小组"}
            className="pl-9"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => { setNewName(""); setNewFolder(folder ?? ""); setCreating(true); }}>
          <Plus className="size-4" />{inFolder ? "新建小组" : "新建大组"}
        </Button>
        {inFolder ? <Button size="sm" variant={managing ? "secondary" : "ghost"} onClick={() => setManaging(!managing)} aria-pressed={managing}>{managing ? "完成管理" : "管理小组"}</Button> : null}
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
      {matchingGroups.length ? <section aria-label="小组搜索结果" className="divide-y divide-border border-y border-border">
        {matchingGroups.map((item) => <Link key={item.id} to="/" search={{ g: item.id }} className="flex items-center justify-between gap-3 py-3 hover:bg-secondary/30">
          <span className="min-w-0"><span className="block text-xs text-muted-foreground">{item.groupName || UNGROUPED_FOLDER}</span><span className="break-words font-medium">{item.name}</span></span><ChevronRight className="size-4 shrink-0" />
        </Link>)}
      </section> : null}
      {!inFolder ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleFolders.map((item) => {
            const percent = item.total ? Math.round(item.mastered / item.total * 100) : 0;
            return (
              <Link key={item.name} to="/" search={{ f: item.name }}
                className="group flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-primary">
                <div className="flex items-start gap-3">
                  <FolderOpen className="mt-1 size-5 shrink-0 text-primary" />
                  <h2 className="min-h-14 min-w-0 flex-1 break-words text-lg font-semibold leading-7">{item.name || UNGROUPED_FOLDER}</h2>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>{item.groups} 个小组</span><span>{item.total} 道题</span>
                </div>
                <div>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">掌握 {percent}%</span>
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
          {clusters.length > 1 ? <h3 className="text-sm font-medium text-muted-foreground">{COLLECTION_KIND_LABEL[cluster.kind]}</h3> : null}
          <CollectionList items={cluster.items} problems={problems} managing={managing} onDelete={onDelete} onReorder={q || !managing ? undefined : onReorder} />
        </section>
      ))}
      {(inFolder ? !filtered.length : !visibleFolders.length && !matchingGroups.length) ? (
        <div className="py-12 text-center">
          <FolderOpen className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {q ? "没有匹配的分组" : inFolder ? "这个大组还没有小组" : "还没有大组"}
          </p>
          {!q ? <Button className="mt-4" variant="outline" onClick={() => setCreating(true)}><Plus className="size-4" />{inFolder ? "新建小组" : "新建大组"}</Button> : null}
        </div>
      ) : null}
      <Dialog open={creating} onOpenChange={(open) => { if (!creatingBusy) setCreating(open); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{inFolder ? "新建小组" : "新建大组"}</DialogTitle><DialogDescription>{inFolder ? folder : "创建大组及其第一个小组。"}</DialogDescription></DialogHeader>
          {!inFolder ? <label className="space-y-2 text-sm">大组名称<Input value={newFolder} maxLength={40} onChange={(e) => setNewFolder(e.target.value)} placeholder="讲义或教材名称" /></label> : null}
          <label className="space-y-2 text-sm">{inFolder ? "小组名称" : "首个小组名称"}<Input value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder="章节名称" /></label>
          <DialogFooter><Button variant="ghost" disabled={creatingBusy} onClick={() => setCreating(false)}>取消</Button><Button disabled={creatingBusy || !newName.trim() || (!inFolder && !newFolder.trim())} onClick={async () => {
            setCreatingBusy(true);
            try { await onCreate(newName.trim(), newFolder.trim()); setCreating(false); }
            catch { toast.error("创建失败，请重试"); }
            finally { setCreatingBusy(false); }
          }}>{creatingBusy ? "创建中…" : "创建"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CollectionList({
  items,
  problems,
  onDelete,
  onReorder,
  managing,
}: {
  items: Collection[];
  problems: Problem[];
  onDelete: (id: string) => void | Promise<void>;
  onReorder?: (ids: string[]) => void;
  managing: boolean;
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
      <div aria-hidden className={cn("hidden items-center gap-3 border-b border-border py-2 text-xs text-muted-foreground sm:grid", managing ? "grid-cols-[2rem_minmax(0,1fr)_4rem_5rem_9rem_2rem]" : "grid-cols-[minmax(0,1fr)_4rem_5rem_9rem]")}>
        {managing ? <span /> : null}<span>小组</span><span className="text-right">题数</span><span className="text-right">待复习</span><span className="text-right">掌握比例</span>{managing ? <span /> : null}
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
            {managing ? <button type="button" disabled={!sortable} aria-label={`拖动${item.name}排序`} title="拖动排序"
              className="grid size-8 shrink-0 touch-none place-items-center rounded-md text-muted-foreground hover:bg-secondary active:cursor-grabbing disabled:invisible"
              onPointerDown={(event) => onGripPointerDown(event, item.id)}
              onPointerMove={(event) => { if (draggingId) setOverIndex(dropIndex(event.clientY)); }}
              onPointerUp={onGripPointerUp}
              onPointerCancel={() => { setDraggingId(null); setOverIndex(null); }}>
              <GripVertical className="size-4" />
            </button> : null}
            <Link to="/" search={{ g: item.id }}
              className="grid min-w-0 flex-1 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-3 focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[minmax(0,1fr)_4rem_5rem_9rem]">
              <span className="col-span-3 break-words text-base font-medium sm:col-span-1">{item.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground sm:text-right sm:text-sm">{count}<span className="sm:hidden"> 道</span><span className="sr-only hidden sm:inline"> 道题</span></span>
              <span className="text-xs tabular-nums text-muted-foreground sm:text-right sm:text-sm"><span className="sm:hidden">待复习 </span><span className="sr-only hidden sm:inline">待复习 </span>{due}</span>
              <span className="min-w-0">
                <span className="mb-1 flex justify-end gap-1 text-xs tabular-nums text-muted-foreground"><span className="sr-only">掌握率 </span>{percent}%</span>
                <span className="block h-1 overflow-hidden rounded-full bg-rule">
                  <span className="block h-full rounded-full bg-mastered" style={{ width: `${percent}%` }} />
                </span>
              </span>
            </Link>
            {managing ? <ConfirmAction title={`删除分组“${item.name}”？`}
              description={count ? `组内 ${count} 道题会保留并移至“未分组”。分组删除后无法恢复。` : "这是一个空分组，删除后无法恢复。"}
              onConfirm={() => onDelete(item.id)}>
              <Button type="button" variant="ghost" size="icon" title="删除小组" aria-label={`删除${item.name}`}
                className="size-8 min-h-8 shrink-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="size-3.5" />
              </Button>
            </ConfirmAction> : null}
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
  suggestions,
  onPatch,
}: {
  name: string;
  groupName: string;
  kind: CollectionKind;
  suggestions: string[];
  onPatch: (patch: CollectionIdentityPatch) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name, groupName, kind });
  const listId = useId();
  const names = [...new Set(suggestions.map((item) => item.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "zh"),
  );

  function save() {
    const next = { ...draft, name: draft.name.trim(), groupName: draft.groupName.trim() };
    if (!next.name) return;
    const patch: CollectionIdentityPatch = {};
    if (next.name !== name) patch.name = next.name;
    if (next.groupName !== groupName) patch.groupName = next.groupName;
    if (next.kind !== kind) patch.kind = next.kind;
    setEditing(false);
    if (Object.keys(patch).length) onPatch(patch);
  }

  if (!editing) return (
    <section aria-label="分组信息" className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="min-w-0">
          <p className="break-words text-sm text-muted-foreground">{groupName || UNGROUPED_FOLDER}</p>
        </div>
        <div className="min-w-0">
          <h1 className="break-words font-display text-2xl font-semibold">{name}</h1>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="shrink-0 text-muted-foreground" aria-label="编辑分组信息"
            onClick={() => { setDraft({ name, groupName, kind }); setEditing(true); }}>
            <Pencil />
          </Button>
        </TooltipTrigger>
        <TooltipContent>编辑分组信息</TooltipContent>
      </Tooltip>
    </section>
  );

  return (
    <form aria-label="编辑分组信息" className="space-y-4 border-b border-border py-4"
      onSubmit={(event) => { event.preventDefault(); save(); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { event.preventDefault(); setEditing(false); }
      }}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          大组
          <Input autoFocus value={draft.groupName} maxLength={40} list={names.length ? listId : undefined}
            placeholder={UNGROUPED_FOLDER} onChange={(event) => setDraft({ ...draft, groupName: event.target.value })} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          小组
          <Input value={draft.name} maxLength={40} required
            onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <datalist id={listId}>{names.map((item) => <option key={item} value={item} />)}</datalist>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          类型
          <select aria-label="类型" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as CollectionKind })}
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-fg">
            {COLLECTION_KINDS.map((item) => <option key={item} value={item}>{COLLECTION_KIND_LABEL[item]}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>取消</Button>
          <Button type="submit" size="sm" disabled={!draft.name.trim()}>保存</Button>
        </div>
      </div>
    </form>
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
