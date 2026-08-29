import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera, Download, FolderOpen, GripVertical, LayoutGrid, List, Pencil, Plus, Search, Upload } from "lucide-react";
import { type PointerEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CollectionPicker } from "@/components/notebook/collection-picker";
import { DateMenu, FilterMenu } from "@/components/notebook/filter-menu";
import { SortableProblems } from "@/components/notebook/sortable-problems";
import { TagEditor, type TagEditorHandle } from "@/components/notebook/tag-editor";
import { TagFilter } from "@/components/notebook/tag-filter";
import { BasketBar } from "@/components/paper/basket-bar";
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
import { formatLoggedDate, matchesDateFilter, type DateFilter } from "@/lib/problems/dates";
import { usePaperStore } from "@/lib/paper/store";
import { selectDueProblems, useProblemStore } from "@/lib/problems/store";
import { MASTERY_LABEL, SUBJECT_LABEL, SUBJECTS, type Mastery, type Problem, type Subject } from "@/lib/problems/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { g?: string } => {
    const g = typeof search.g === "string" ? search.g : "";
    return g ? { g } : {};
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
  const { g = "" } = Route.useSearch();
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
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [tagOpen, setTagOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [folderRename, setFolderRename] = useState<{ from: string; to: string; others: number } | null>(null);
  const [batchTags, setBatchTags] = useState<string[]>([]);
  const [commonTags, setCommonTags] = useState<string[]>([]);
  const [batchGroupId, setBatchGroupId] = useState("");
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
  }, [g]);

  const dueCount = useMemo(() => selectDueProblems(problems).length, [problems]);
  const masteredCount = useMemo(
    () => problems.filter((p) => p.mastery === "mastered").length,
    [problems],
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
      if (!matchesDateFilter(p.createdAt, dateFilter, dateDay)) return false;
      if (!q) return true;
      const hay = `${p.title} ${p.stem} ${p.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    if (g && g !== "all") return sortBySourceOrder(list);
    return list;
  }, [problems, filter, tagFilter, masteryFilter, query, dateFilter, dateDay, g]);

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
      a.download = `墨题备份-${stamp}.json`;
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
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-semibold tracking-tight">概览</h1>
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
          <Stat label="收录" value={problems.length} />
          <Stat label="待复习" value={dueCount} />
          <Stat label="已掌握" value={masteredCount} />
        </div>
      </section>

      <BasketBar />

      {!g ? (
        <GroupHome
          problems={problems}
          collections={collections}
          dueCount={dueCount}
          onCreate={async () => {
            const id = await addCollection({ name: defaultCollectionName(), kind: "exam" });
            navigate({ to: "/", search: { g: id } });
          }}
          onDelete={(id) => void deleteCollection(id)}
          onReorder={(ids) => void reorderCollections(ids)}
          onRenameFolder={(from, to) => {
            void renameFolder(from, to).then((n) => {
              toast.success(`已把 ${n} 个小组改到「${to || "未分大组"}」`);
            });
          }}
        />
      ) : (
      <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/" search={{ g: "" }}>
              <ArrowLeft className="size-4" />
              分组
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
      <SortableProblems
        problems={problems}
        layout={layout}
        selecting={selecting}
        selected={selected}
        onToggle={onToggle}
        onMasteryChange={onMasteryChange}
        onReorder={onReorder}
      />
    );
  }

  return (
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
  );
}

function GroupHome({
  problems,
  collections,
  dueCount,
  onCreate,
  onDelete,
  onReorder,
  onRenameFolder,
}: {
  problems: Problem[];
  collections: Collection[];
  dueCount: number;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onRenameFolder: (from: string, to: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = Date.now();
  const ungrouped = problems.filter((p) => !p.collectionId);
  const dueOf = (ids: Set<string> | "none" | "all") =>
    problems.filter((p) => {
      if (p.mastery === "mastered" || p.nextReviewAt > now) return false;
      if (ids === "all") return true;
      if (ids === "none") return !p.collectionId;
      return !!p.collectionId && ids.has(p.collectionId);
    }).length;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? collections.filter((item) => item.name.toLowerCase().includes(q))
    : collections;

  const latest = (id?: string) => {
    const list = id ? problems.filter((p) => p.collectionId === id) : problems.filter((p) => !p.collectionId);
    return [...list].sort((a, b) => b.createdAt - a.createdAt)[0];
  };

  const folders = Array.from(
    new Set(filtered.map((item) => item.groupName.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "zh"));
  if (filtered.some((item) => !item.groupName.trim())) folders.push("");

  const clusters = folders.map((folder) => ({
    folder,
    kinds: KIND_ORDER.map((kind) => ({
      kind,
      items: sortCollectionsByOrder(
        filtered.filter((item) => (item.groupName.trim() || "") === folder && item.kind === kind),
        (item) => latest(item.id)?.createdAt ?? 0,
      ),
    })).filter((cluster) => cluster.items.length),
  })).filter((group) => group.kinds.length);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1">
        {searchOpen || query ? (
          <div className="flex h-8 items-center gap-1 rounded-full bg-secondary/70 px-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => {
                if (!query.trim()) setSearchOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("");
                  setSearchOpen(false);
                }
              }}
              className="w-28 bg-transparent text-sm text-fg outline-none"
              aria-label="搜索分组"
            />
          </div>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 min-h-8 text-muted-foreground"
            aria-label="搜索分组"
            onClick={() => {
              setSearchOpen(true);
              window.setTimeout(() => searchRef.current?.focus(), 0);
            }}
          >
            <Search className="size-4" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="size-8 min-h-8 text-muted-foreground" aria-label="新建组" onClick={onCreate}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/"
          search={{ g: "all" }}
          className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] transition-colors hover:bg-secondary/40"
        >
          <p className="text-xs text-muted-foreground">全部</p>
          <p className="mt-1 font-display text-lg font-semibold">{problems.length} 道</p>
          <p className="mt-1 text-xs text-muted-foreground">待复习 {dueCount}</p>
        </Link>
        {ungrouped.length ? (
          <Link
            to="/"
            search={{ g: "ungrouped" }}
            className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] transition-colors hover:bg-secondary/40"
          >
            <p className="text-xs text-muted-foreground">未分组</p>
            <p className="mt-1 font-display text-lg font-semibold">{ungrouped.length} 道</p>
            <p className="mt-1 text-xs text-muted-foreground">
              待复习 {dueOf("none")}
              {latest() ? ` · 最近 ${formatLoggedDate(latest()!.createdAt)}` : ""}
            </p>
            {latest() ? <p className="mt-2 truncate text-sm text-fg/80">{latest()!.title}</p> : null}
          </Link>
        ) : null}
      </div>
      {clusters.map((group) => (
        <section key={group.folder || "none"} className="flex flex-col gap-4">
          <FolderHeading name={group.folder} onRename={(next) => onRenameFolder(group.folder, next)} />
          {group.kinds.map((cluster) => (
        <section key={`${group.folder}-${cluster.kind}`} className="flex flex-col gap-3">
          <h3 className="text-xs font-medium tracking-wider text-muted-foreground">
            {COLLECTION_KIND_LABEL[cluster.kind]}
          </h3>
          <CollectionGrid
            items={cluster.items}
            problems={problems}
            latest={latest}
            dueOf={(id) => dueOf(new Set([id]))}
            onDelete={onDelete}
            onReorder={q ? undefined : onReorder}
          />
        </section>
          ))}
        </section>
      ))}
      {q && !filtered.length ? (
        <div className="rounded-xl bg-surface px-6 py-10 text-center shadow-[var(--shadow-border)]">
          <p className="text-sm text-muted-foreground">没有叫这个名字的组</p>
        </div>
      ) : null}
      {!collections.length && !ungrouped.length && !problems.length ? (
        <div className="rounded-xl bg-surface px-6 py-12 text-center shadow-[var(--shadow-border)]">
          <FolderOpen className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-display text-lg font-semibold">还没有分组</p>
          <Button asChild className="mt-4">
            <Link to="/capture">去拍题</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CollectionGrid({
  items,
  problems,
  latest,
  dueOf,
  onDelete,
  onReorder,
}: {
  items: Collection[];
  problems: Problem[];
  latest: (id: string) => Problem | undefined;
  dueOf: (id: string) => number;
  onDelete: (id: string) => void;
  onReorder?: (ids: string[]) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const sortable = Boolean(onReorder) && items.length > 1;

  function dropIndex(clientX: number, clientY: number) {
    const nodes = [...(gridRef.current?.querySelectorAll("[data-collection-row]") ?? [])];
    for (let index = 0; index < nodes.length; index += 1) {
      const box = nodes[index].getBoundingClientRect();
      if (clientY < box.top || (clientY <= box.bottom && clientX < box.left + box.width / 2)) return index;
    }
    return nodes.length;
  }

  function onGripPointerDown(event: PointerEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
    setOverIndex(items.findIndex((item) => item.id === id));
  }

  function onGripPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingId) return;
    setOverIndex(dropIndex(event.clientX, event.clientY));
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
    <div ref={gridRef} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => {
        const count = problems.filter((problem) => problem.collectionId === item.id).length;
        const recent = latest(item.id);
        return (
          <div
            key={item.id}
            data-collection-row={item.id}
            className={cn(
              "relative rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] transition-[opacity,box-shadow]",
              draggingId === item.id && "opacity-60",
              draggingId && overIndex === index && draggingId !== item.id && "ring-2 ring-primary",
            )}
          >
            <Link to="/" search={{ g: item.id }} className="block">
              <p className={cn("mt-0 font-display text-lg font-semibold", sortable && "pl-7 pr-8")}>{item.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {count} 道 · 待复习 {dueOf(item.id)}
                {recent ? ` · ${formatLoggedDate(recent.createdAt)}` : ""}
              </p>
              {recent ? (
                <p className="mt-2 truncate text-sm text-fg/80">{recent.title}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">还没有题目</p>
              )}
            </Link>
            {sortable ? (
              <button
                type="button"
                aria-label={`拖动${item.name}排序`}
                className="absolute left-2 top-2 grid size-8 touch-none place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-fg active:cursor-grabbing"
                onPointerDown={(event) => onGripPointerDown(event, item.id)}
                onPointerMove={onGripPointerMove}
                onPointerUp={onGripPointerUp}
                onPointerCancel={onGripPointerUp}
                onClick={(event) => event.preventDefault()}
              >
                <GripVertical className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              className="absolute right-3 top-3 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(item.id)}
            >
              删除
            </button>
          </div>
        );
      })}
    </div>
  );
}

function FolderHeading({ name, onRename }: { name: string; onRename: (next: string) => void }) {
  const [text, setText] = useState(name);
  const [editing, setEditing] = useState(false);
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
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="font-display text-lg font-semibold">{name || UNGROUPED_FOLDER}</h2>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 min-h-7 text-muted-foreground"
        aria-label="改名"
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-3.5" />
      </Button>
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
