import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, LoaderCircle, Search, X } from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FilterMenu, DateMenu, dateFilterLabel } from "@/components/notebook/filter-menu";
import { ProblemCard } from "@/components/notebook/problem-card";
import { TagFilter } from "@/components/notebook/tag-filter";
import { ExtraFilters } from "@/components/notebook/extra-filters";
import { ArrangeList, SheetKindToggle } from "@/components/paper/arrange-list";
import { PaperSteps } from "@/components/paper/paper-steps";
import { ExamSheet } from "@/components/paper/exam-sheet";
import { LatexPdfPreview } from "@/components/paper/latex-pdf-preview";
import { TemplateList } from "@/components/paper/template-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BackButton } from "@/components/ui/back-button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { resolveExamItems, rowsFromIds, type PaperRow, type SheetKind } from "@/lib/paper/layout";
import { buildExamPdf } from "@/lib/paper/pdf";
import { samePaperExport, type PaperExportInput } from "@/lib/paper/export-state";
import { coerceAnswerPlacement, type AnswerPlacement } from "@/lib/paper/answer-placement";
import { paperFileStem, saveSamplePdf } from "@/lib/paper/sample";
import {
  applyTemplateRows,
  DEFAULT_EXAM_TITLE,
  DEFAULT_HANDOUT_TITLE,
  normalizePaperTitle,
} from "@/lib/paper/session";
import {
  BLANK_LINE_OPTIONS,
  blankLineLabel,
  coerceBlankAuto,
  coerceBlankLines,
  DEFAULT_BLANK_LINES,
  type BlankLines,
} from "@/lib/paper/space";
import { usePaperStore } from "@/lib/paper/store";
import { formatLoggedDateLong, matchesDateFilter, type DateFilter } from "@/lib/problems/dates";
import { idsInSourceOrder, sortBySourceOrder } from "@/lib/problems/order";
import { useProblemStore } from "@/lib/problems/store";
import { sortCollectionsByOrder, UNGROUPED_FOLDER } from "@/lib/problems/collections";
import { matchesAllTags } from "@/lib/problems/tags";
import { MASTERY_LABEL, SUBJECT_LABEL, SUBJECTS, type Mastery, type Problem, type Subject } from "@/lib/problems/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/paper")({
  validateSearch: (search: Record<string, unknown>): { ids: string; tpl: string; title?: string; sheet?: SheetKind } => ({
    ids: typeof search.ids === "string" ? search.ids : "",
    tpl: typeof search.tpl === "string" ? search.tpl : "",
    ...(typeof search.title === "string" && search.title.trim() ? { title: search.title } : {}),
    ...(search.sheet === "exam" || search.sheet === "handout" ? { sheet: search.sheet } : {}),
  }),
  component: PaperPage,
});

function PaperPage() {
  const { ids, tpl, title: initialTitle, sheet: initialSheetKind } = Route.useSearch();
  const navigate = useNavigate();
  const problems = useProblemStore((s) => s.problems);
  const loadProblem = useProblemStore((s) => s.loadProblem);
  const status = useProblemStore((s) => s.status);
  const collections = useProblemStore((s) => s.collections);
  const selectedIds = useMemo(() => ids.split(",").map((s) => s.trim()).filter(Boolean), [ids]);
  const selected = useMemo(
    () => selectedIds.map((id) => problems.find((p) => p.id === id)).filter(Boolean) as typeof problems,
    [selectedIds, problems],
  );
  const idsKey = selectedIds.join(",");
  const tplStamp = usePaperStore((s) => {
    if (!tpl) return "";
    const item = s.templates.find((row) => row.id === tpl);
    return item ? `${item.id}:${item.updatedAt}` : "pending";
  });
  const [rows, setRows] = useState<PaperRow[]>([]);
  const [title, setTitle] = useState(DEFAULT_EXAM_TITLE);
  const [withAnswers, setWithAnswers] = useState(false);
  const [answerPlacement, setAnswerPlacement] = useState<AnswerPlacement>("inline");
  const [blankLines, setBlankLines] = useState<BlankLines>(DEFAULT_BLANK_LINES);
  const [blankAuto, setBlankAuto] = useState(false);
  const [sheetKind, setSheetKind] = useState<SheetKind>("exam");
  const [step, setStep] = useState<"arrange" | "preview">("arrange");
  const [figureAttempt, setFigureAttempt] = useState(0);
  const [figureLoadError, setFigureLoadError] = useState(false);
  const examItems = useMemo(
    () => resolveExamItems(rows, selected, blankLines, sheetKind),
    [rows, selected, blankLines, sheetKind],
  );
  const warmedPaper = useRef("");
  useEffect(() => {
    if (step !== "arrange" || status !== "ready" || sheetKind !== "exam" || !examItems.length ||
      selected.length !== selectedIds.length || !selected.every(p =>
        collections.find(c => c.id === p.collectionId)?.groupName === "高考数学" && p.figures.every(f => f.image || f.svg))) return;
    const stamp = JSON.stringify([idsKey, title, withAnswers]);
    if (warmedPaper.current === stamp) return;
    const timer = window.setTimeout(() => {
      warmedPaper.current = stamp;
      void import("@/lib/paper/gaokao-pdf-client").then(({ getGaokaoPdf }) =>
        getGaokaoPdf(examItems, { title, withAnswers, minutes: 120, solutionSpaceCm: 5 })).catch(() => {});
    }, 150);
    return () => window.clearTimeout(timer);
  }, [step, status, sheetKind, examItems, selected, selectedIds, collections, idsKey, title, withAnswers]);

  useEffect(() => {
    if (status !== "ready") return;
    // Notebook text is complete; only figures omitted from list records need loading.
    const byId = new Map(useProblemStore.getState().problems.map((p) => [p.id, p]));
    const pending = selectedIds.filter((id) => byId.get(id)?.figures.some((f) => !f.image && !f.svg));
    setFigureLoadError(false);
    let active = true;
    let cursor = 0;
    async function loadNext() {
      while (active && cursor < pending.length) await loadProblem(pending[cursor++]);
    }
    void Promise.all(Array.from({ length: Math.min(4, pending.length) }, loadNext)).then(() => {
      if (active) setFigureLoadError(useProblemStore.getState().problems.some(
        (p) => pending.includes(p.id) && p.figures.some((f) => !f.image && !f.svg),
      ));
    });
    return () => { active = false; };
  }, [selectedIds, loadProblem, status, figureAttempt]);

  useEffect(() => {
    const template = usePaperStore.getState().templates.find((item) => item.id === tpl);
    if (template) {
      const available = new Set(selectedIds);
      const nextRows = applyTemplateRows(template.rows, available);
      setRows(nextRows.length ? nextRows : rowsFromIds(selectedIds));
      setTitle(normalizePaperTitle(template.title, template.sheetKind));
      setWithAnswers(template.withAnswers);
      setAnswerPlacement(coerceAnswerPlacement(template.answerPlacement));
      setBlankLines(coerceBlankLines(template.blankLines));
      setBlankAuto(coerceBlankAuto(template.blankAuto, template.blankLines));
      setSheetKind(template.sheetKind === "handout" ? "handout" : "exam");
      setStep("arrange");
      return;
    }
    const nextSheetKind: SheetKind = initialSheetKind === "handout" ? "handout" : "exam";
    setRows(rowsFromIds(selectedIds));
    setTitle(normalizePaperTitle(initialTitle, nextSheetKind));
    setWithAnswers(false);
    setAnswerPlacement("inline");
    setBlankLines(DEFAULT_BLANK_LINES);
    setBlankAuto(false);
    setSheetKind(nextSheetKind);
    setStep("arrange");
  }, [idsKey, tpl, tplStamp, selectedIds, initialTitle, initialSheetKind]);

  if (!selectedIds.length) {
    return <PaperPicker />;
  }

  if (selected.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="font-display text-2xl font-semibold">这些题目不在题库里</p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/paper" search={{ ids: "", tpl: "" }}>
            重新选题
          </Link>
        </Button>
      </div>
    );
  }

  if (step === "arrange") {
    return (
      <ArrangeList
        rows={rows}
        problems={selected}
        sheetKind={sheetKind}
        onSheetKind={(kind) => {
          setSheetKind(kind);
          if (kind === "handout" && title === DEFAULT_EXAM_TITLE) setTitle(DEFAULT_HANDOUT_TITLE);
          if (kind === "exam" && title === DEFAULT_HANDOUT_TITLE) setTitle(DEFAULT_EXAM_TITLE);
        }}
        onChange={setRows}
        onApplyMeta={({ title: nextTitle, withAnswers: nextAnswers, answerPlacement: nextPlacement, blankLines: nextBlank, blankAuto: nextAuto, sheetKind: nextKind }) => {
          setTitle(nextTitle);
          setWithAnswers(nextAnswers);
          setAnswerPlacement(nextPlacement);
          setBlankLines(nextBlank);
          setBlankAuto(nextAuto);
          setSheetKind(nextKind);
        }}
        onNext={() => setStep("preview")}
        onBack={() => { void navigate({ to: "/paper", search: { ids: "", tpl: "" } }); }}
      />
    );
  }

  return (
    <PaperPreview
      items={examItems}
      rows={rows}
      title={title}
      withAnswers={withAnswers}
      answerPlacement={answerPlacement}
      blankLines={blankLines}
      blankAuto={blankAuto}
      sheetKind={sheetKind}
      figureLoadError={figureLoadError}
      onRetryFigures={() => setFigureAttempt((n) => n + 1)}
      onTitle={setTitle}
      onAnswers={setWithAnswers}
      onAnswerPlacement={setAnswerPlacement}
      onBlankLines={setBlankLines}
      onBlankAuto={setBlankAuto}
      onSheetKind={(kind) => {
        setSheetKind(kind);
        if (kind === "handout" && title === DEFAULT_EXAM_TITLE) setTitle(DEFAULT_HANDOUT_TITLE);
        if (kind === "exam" && title === DEFAULT_HANDOUT_TITLE) setTitle(DEFAULT_EXAM_TITLE);
      }}
      onBack={() => setStep("arrange")}
    />
  );
}

const PICKER_PAGE_SIZE = 24;

const PickerCard = memo(function PickerCard({ problem, selected, onToggle, sourceLabel }: {
  problem: Problem; selected: boolean; onToggle: (id: string) => void; sourceLabel?: string;
}) {
  return <ProblemCard problem={problem} selecting selected={selected} sourceLabel={sourceLabel} onToggle={() => onToggle(problem.id)} />;
});

function PaperPicker() {
  const problems = useProblemStore((s) => s.problems);
  const collections = useProblemStore((s) => s.collections);
  const status = useProblemStore((s) => s.status);
  const navigate = useNavigate();
  const addToBasket = usePaperStore((s) => s.addToBasket);
  const basket = usePaperStore((s) => s.basket);
  const removeBasketItems = usePaperStore((s) => s.removeBasketItems);
  const clearBasket = usePaperStore((s) => s.clearBasket);
  const picked = useMemo(() => new Set(basket.filter((id) => problems.some((p) => p.id === id))), [basket, problems]);
  const [filter, setFilter] = useState<"all" | Subject>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [dateDay, setDateDay] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [mastery, setMastery] = useState<"all" | Mastery>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searching = query !== deferredQuery;
  const [folder, setFolder] = useState<string | null>(null);
  const [group, setGroup] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const collectionLabels = useMemo(() => new Map(collections.map((collection) => [collection.id, `${collection.groupName || UNGROUPED_FOLDER} / ${collection.name}`])), [collections]);
  const [page, setPage] = useState(1);
  const pagerRef = useRef<HTMLDivElement>(null);
  const folders = useMemo(() => [...new Set(collections.map((c) => c.groupName.trim()))]
    .sort((a, b) => a.localeCompare(b, "zh")), [collections]);
  const groups = useMemo(() => sortCollectionsByOrder(
    collections.filter((c) => folder === null || c.groupName.trim() === folder),
    (c) => c.createdAt,
  ), [collections, folder]);
  const groupIds = useMemo(() => new Set(groups.map((c) => c.id)), [groups]);
  const scoped = useMemo(() => problems.filter((p) => {
    if (group === "ungrouped") return !p.collectionId;
    if (group) return p.collectionId === group;
    return folder === null || Boolean(p.collectionId && groupIds.has(p.collectionId));
  }), [problems, folder, group, groupIds]);

  useEffect(() => { setPage(1); }, [filter, dateFilter, dateDay, tags, mastery, deferredQuery, folder, group, onlyPicked]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of scoped) for (const t of p.tags) set.add(t);
    return [...set];
  }, [scoped]);

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list = scoped.filter((p) => {
      if (filter !== "all" && p.subject !== filter) return false;
      if (!matchesDateFilter(p.createdAt, dateFilter, dateDay)) return false;
      if (!matchesAllTags(p.tags, tags)) return false;
      if (mastery !== "all" && p.mastery !== mastery) return false;
      if (!q) return true;
      return `${p.title} ${p.stem} ${p.tags.join(" ")}`.toLowerCase().includes(q);
    });
    return sortBySourceOrder(list);
  }, [scoped, filter, dateFilter, dateDay, tags, mastery, deferredQuery]);

  const results = useMemo(() => onlyPicked ? visible.filter((p) => picked.has(p.id)) : visible, [visible, onlyPicked, picked]);
  const pageCount = Math.max(1, Math.ceil(results.length / PICKER_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = results.slice((currentPage - 1) * PICKER_PAGE_SIZE, currentPage * PICKER_PAGE_SIZE);
  const visibleIds = useMemo(() => new Set(visible.map((p) => p.id)), [visible]);

  const hiddenPicked = useMemo(
    () => problems.filter((p) => picked.has(p.id) && !visibleIds.has(p.id)),
    [problems, picked, visibleIds],
  );
  const allVisibleSelected = pageItems.length > 0 && pageItems.every((p) => picked.has(p.id));

  const toggle = useCallback((id: string) => {
    const store = usePaperStore.getState();
    if (store.basket.includes(id)) store.removeFromBasket(id);
    else if (!store.addToBasket([id])) toast.error("选题数量已达上限，请分批组卷");
  }, []);

  function goToPage(next: number) {
    setPage(next);
    pagerRef.current?.scrollIntoView({ block: "start" });
  }

  function toggleVisible() {
    if (allVisibleSelected) removeBasketItems(pageItems.map((p) => p.id));
    else {
      const ids = pageItems.filter((p) => !picked.has(p.id)).map((p) => p.id);
      if (addToBasket(ids) < ids.length) toast.error("部分题目未加入：已达选题数量上限");
    }
  }

  const subjectOptions: { id: "all" | Subject; label: string }[] = [
    { id: "all", label: "全部科目" },
    ...SUBJECTS.map((s) => ({ id: s as "all" | Subject, label: SUBJECT_LABEL[s] })),
  ];
  const masteryOptions: { id: "all" | Mastery; label: string }[] = [
    { id: "all", label: "全部状态" },
    ...(["new", "reviewing", "mastered"] as Mastery[]).map((id) => ({ id, label: MASTERY_LABEL[id] })),
  ];

  return (
    <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold">组卷</h1>
          <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
            <DialogTrigger asChild><Button variant="ghost" size="sm">已存模板</Button></DialogTrigger>
            <DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>已存模板</DialogTitle></DialogHeader><TemplateList showHeading={false} showEmpty /></DialogContent>
          </Dialog>
        </div>

      <PaperSteps current="pick" />

      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <SearchableSelect label="选题大组" value={folder === null ? "" : JSON.stringify(folder)}
            onChange={(value) => { setFolder(value ? JSON.parse(value) as string : null); setGroup(""); setTags([]); }}
            options={[{ value: "", label: "全部大组" }, ...folders.map((name) => ({ value: JSON.stringify(name), label: name || UNGROUPED_FOLDER }))]} />
          <SearchableSelect label="选题小组" value={group} onChange={(value) => { setGroup(value); setTags([]); }}
            options={[{ value: "", label: "全部小组" }, ...(folder === null ? [{ value: "ungrouped", label: "未分组题目" }] : []), ...groups.map((c) => ({ value: c.id, label: `${folder === null ? `${c.groupName || UNGROUPED_FOLDER} / ` : ""}${c.name}` }))]} />
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索题干、标签…"
            className="pl-9"
            aria-label="搜索题目"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu idleLabel="例题 / 习题" emptyValue="all" value={tags.find((tag) => tag === "例题" || tag === "习题") || "all"}
            options={[{ id: "all", label: "全部题目" }, { id: "例题", label: "例题" }, { id: "习题", label: "习题" }]}
            onChange={(kind) => setTags((previous) => [...previous.filter((tag) => tag !== "例题" && tag !== "习题"), ...(kind === "all" ? [] : [kind])])} />
          <FilterMenu idleLabel="掌握状态" emptyValue="all" value={mastery} options={masteryOptions} onChange={setMastery} />
          <ExtraFilters activeCount={Number(filter !== "all") + Number(dateFilter !== "all") + tags.filter((tag) => tag !== "例题" && tag !== "习题").length}
            activeFilters={[
              ...(filter !== "all" ? [{ key: "subject", label: SUBJECT_LABEL[filter], onRemove: () => setFilter("all") }] : []),
              ...(dateFilter !== "all" ? [{ key: "date", label: dateFilterLabel(dateFilter, dateDay), onRemove: () => { setDateFilter("all"); setDateDay(""); } }] : []),
              ...tags.filter((tag) => tag !== "例题" && tag !== "习题").map((tag) => ({ key: `tag:${tag}`, label: tag, onRemove: () => setTags((previous) => previous.filter((item) => item !== tag)) })),
            ]}
            onClear={() => { setFilter("all"); setDateFilter("all"); setDateDay(""); setTags((previous) => previous.filter((tag) => tag === "例题" || tag === "习题")); }}>
          <FilterMenu
            idleLabel="科目"
            emptyValue="all"
            value={filter}
            options={subjectOptions}
            onChange={setFilter}
          />
          <DateMenu
            value={dateFilter}
            day={dateDay}
            onChange={(next, day) => {
              setDateFilter(next);
              setDateDay(day);
            }}
          />
          <TagFilter tags={allTags.filter((tag) => tag !== "例题" && tag !== "习题")} value={tags.filter((tag) => tag !== "例题" && tag !== "习题")} onChange={(next) => setTags((previous) => [...previous.filter((tag) => tag === "例题" || tag === "习题"), ...next])} />
          </ExtraFilters>
        </div>
      </div>

      <div ref={pagerRef} className="sticky top-14 z-10 flex scroll-mt-16 flex-wrap items-center gap-3 border-y border-border bg-surface px-3 py-2 sm:top-16">
        <div className="flex w-full flex-wrap items-center gap-2">
          <button type="button" className="text-sm text-muted-foreground hover:text-fg" onClick={toggleVisible} disabled={!pageItems.length || searching}>
            {allVisibleSelected ? "取消本页全选" : "全选本页"}
          </button>
          <span className="text-sm text-muted-foreground">已选 {picked.size}</span>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4 accent-primary" disabled={status !== "ready"} checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} />只看已选
          </label>
          {picked.size ? (
            <ConfirmAction title="清空已选题目？" description="仅取消组卷选择，不会删除题库中的题目。" confirmLabel="确认清空" onConfirm={clearBasket}><button type="button" className="text-sm text-muted-foreground hover:text-fg">
              清空已选
            </button></ConfirmAction>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!picked.size}
              onClick={() => navigate({ to: "/paper", search: { ids: idsInSourceOrder(problems, picked).join(","), tpl: "" } })}
            >
              下一步：排版
            </Button>
          </div>
        </div>
        {hiddenPicked.length ? (
          <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-border pt-2">
            <span className="text-xs text-muted-foreground">筛选外已选 {hiddenPicked.length} 道</span>
            {hiddenPicked.slice(0, 6).map((p) => (
              <button
                key={p.id}
                type="button"
                className="inline-flex h-7 max-w-40 items-center gap-1 rounded-full bg-secondary pl-2.5 pr-1 text-xs"
                onClick={() => toggle(p.id)}
                title="点掉取消选择"
              >
                <span className="truncate">{p.title}</span>
                <X className="size-3 shrink-0 text-muted-foreground" />
              </button>
            ))}
            {hiddenPicked.length > 6 ? <span className="text-xs text-muted-foreground">另 {hiddenPicked.length - 6} 道</span> : null}
            <button type="button" className="text-xs text-primary" onClick={() => {
              setFolder(null); setGroup(""); setQuery(""); setFilter("all");
              setDateFilter("all"); setDateDay(""); setTags([]); setMastery("all"); setOnlyPicked(true);
            }}>查看全部已选</button>
          </div>
        ) : null}
      </div>

      {(status === "idle" || status === "loading") && !problems.length ? (
        <p role="status" className="py-12 text-center text-sm text-muted-foreground">正在加载题库…</p>
      ) : problems.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">题库还是空的。</p>
      ) : results.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">当前筛选没有题目。已选 {picked.size} 道仍保留。</p>
      ) : (
        <div aria-label="选题列表" aria-busy={searching} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((problem) => (
            <PickerCard
              key={problem.id}
              problem={problem}
              sourceLabel={!group ? collectionLabels.get(problem.collectionId ?? "") || "未分组" : undefined}
              selected={picked.has(problem.id)}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
      <nav aria-label="选题分页" className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground" role="status">{searching ? "搜索中…" : `共 ${results.length} 道 · ${results.length ? (currentPage - 1) * PICKER_PAGE_SIZE + 1 : 0}–${Math.min(currentPage * PICKER_PAGE_SIZE, results.length)}`}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="上一页" title="上一页" disabled={currentPage <= 1 || searching} onClick={() => goToPage(currentPage - 1)}><ChevronLeft /></Button>
          <select aria-label="选题页码" className="h-9 max-w-28 rounded-md border border-border bg-surface px-2 text-sm tabular-nums" value={currentPage} disabled={!results.length || searching} onChange={(e) => goToPage(Number(e.target.value))}>
            {Array.from({ length: pageCount }, (_, index) => <option key={index} value={index + 1}>{index + 1} / {pageCount} 页</option>)}
          </select>
          <Button variant="ghost" size="icon" aria-label="下一页" title="下一页" disabled={currentPage >= pageCount || searching} onClick={() => goToPage(currentPage + 1)}><ChevronRight /></Button>
        </div>
      </nav>
    </div>
  );
}

function PaperPreview({
  items,
  rows,
  title,
  withAnswers,
  answerPlacement,
  blankLines,
  blankAuto,
  sheetKind,
  figureLoadError,
  onRetryFigures,
  onTitle,
  onAnswers,
  onAnswerPlacement,
  onBlankLines,
  onBlankAuto,
  onSheetKind,
  onBack,
}: {
  items: ReturnType<typeof resolveExamItems>;
  rows: PaperRow[];
  title: string;
  withAnswers: boolean;
  answerPlacement: AnswerPlacement;
  blankLines: BlankLines;
  blankAuto: boolean;
  sheetKind: SheetKind;
  figureLoadError: boolean;
  onRetryFigures: () => void;
  onTitle: (value: string) => void;
  onAnswers: (value: boolean) => void;
  onAnswerPlacement: (value: AnswerPlacement) => void;
  onBlankLines: (value: BlankLines) => void;
  onBlankAuto: (value: boolean) => void;
  onSheetKind: (kind: SheetKind) => void;
  onBack: () => void;
}) {
  const saveTemplate = usePaperStore((s) => s.saveTemplate);
  const collections = useProblemStore((s) => s.collections);
  const groupName = useMemo(() => {
    const groups = items.filter(item => item.kind === "problem").map(item =>
      collections.find(c => c.id === item.problem.collectionId)?.groupName ?? "");
    return sheetKind === "handout" && groups.length && groups.every(g => g === groups[0]) ? groups[0] : "";
  }, [collections, items, sheetKind]);
  const [previewError, setPreviewError] = useState("");
  const isGaokao = items.some(item => item.kind === "problem") && items.every(item => item.kind === "heading" ||
    collections.find(c => c.id === item.problem.collectionId)?.groupName === "高考数学");
  const [texTemplate, setTexTemplate] = useState<"auto" | "general" | "gaokao">("auto");
  const gaokaoTex = sheetKind === "exam" && (texTemplate === "gaokao" || (texTemplate === "auto" && isGaokao));
  const [compiledPdf, setCompiledPdf] = useState<{ key: PaperExportInput; blob: Blob; warnings: string[] } | null>(null);
  const [compileRetry, setCompileRetry] = useState(0);
  const [examMinutes, setExamMinutes] = useState(120);
  const [solutionSpace, setSolutionSpace] = useState(5);
  const [tplName, setTplName] = useState(title);
  const [exporting, setExporting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [mountPreview, setMountPreview] = useState(false);
  useEffect(() => {
    // Paint the loading state before mounting the formula-heavy measurement tree.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setMountPreview(true));
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const dateLabel = formatLoggedDateLong(Date.now());
  const [generatedKey, setGeneratedKey] = useState<PaperExportInput | null>(null);
  const exportKey = useMemo<PaperExportInput>(
    () => ({ items, title, groupName, dateLabel, withAnswers, answerPlacement, blankLines, blankAuto, sheetKind,
      template: gaokaoTex ? "gaokao" : "general", examMinutes: gaokaoTex ? examMinutes : undefined,
      solutionSpaceCm: gaokaoTex ? solutionSpace : undefined }),
    [items, title, groupName, dateLabel, withAnswers, answerPlacement, blankLines, blankAuto, sheetKind, gaokaoTex, examMinutes, solutionSpace],
  );
  const [readyKey, setReadyKey] = useState<object | null>(null);
  useEffect(() => setPreviewError(""), [exportKey]);
  const onPreviewReady = useCallback(() => setReadyKey(exportKey), [exportKey]);
  const figuresReady = items.every((item) => item.kind === "heading" || item.problem.figures.every((f) => f.image || f.svg));
  const currentCompiled = gaokaoTex && compiledPdf && samePaperExport(compiledPdf.key, exportKey) ? compiledPdf : null;
  const previewReady = figuresReady && (gaokaoTex ? !!currentCompiled && !previewError : readyKey === exportKey);
  const lastCompileMode = useRef("");
  useEffect(() => {
    if (!gaokaoTex || !figuresReady) return;
    let cancelled = false;
    setPreviewError("");
    const mode = `${gaokaoTex}:${withAnswers}:${compileRetry}`;
    const delay = mode === lastCompileMode.current ? 350 : 0;
    lastCompileMode.current = mode;
    const timer = window.setTimeout(() => {
      void (async () => {
        const { getGaokaoPdf } = await import("@/lib/paper/gaokao-pdf-client");
        if (cancelled) return;
        const result = await getGaokaoPdf(exportKey.items, {
          title: exportKey.title, withAnswers: exportKey.withAnswers,
          minutes: exportKey.examMinutes, solutionSpaceCm: exportKey.solutionSpaceCm,
        });
        if (cancelled) return;
        setCompiledPdf({ key: exportKey, ...result });
      })().catch(error => { if (!cancelled) setPreviewError(error instanceof Error ? error.message : "LaTeX 排版失败"); });
    }, delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [gaokaoTex, figuresReady, exportKey, compileRetry, withAnswers]);
  const exportUnchanged = useMemo(() => samePaperExport(generatedKey, exportKey), [generatedKey, exportKey]);
  const currentPdf = pdfUrl && exportUnchanged;
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  const pdfStem = paperFileStem(withAnswers && !title.trim().endsWith("解析版") ? `${title}-解析版` : title);
  const pdfName = `${pdfStem}.pdf`;
  const inlineAnswers = withAnswers && (sheetKind !== "handout" || answerPlacement === "inline");

  async function blobToBase64(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      bin += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return btoa(bin);
  }

  async function generatePdf() {
    if (!previewReady || exporting) return;
    setExporting(true);
    try {
      const blob = gaokaoTex ? currentCompiled!.blob : await buildExamPdf([], { title, dateLabel, withAnswers });
      const url = URL.createObjectURL(blob);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setGeneratedKey(exportKey);
      try {
        const base64 = await blobToBase64(blob);
        await saveSamplePdf({ data: { name: pdfStem, base64 } });
      } catch {
        /* preview disk is optional */
      }
      toast.success("PDF 已生成，请点下载");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "PDF 生成失败");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <BackButton className="self-start" onClick={onBack} title="返回排版" disabled={exporting} />
      <PaperSteps current="preview" />
      <div className="no-print flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">{sheetKind === "handout" ? "预览学案" : "预览试卷"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A4 · {items.filter((item) => item.kind === "problem").length} 道题
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!currentPdf ? <Button onClick={() => void generatePdf()} disabled={exporting || !previewReady}>
              {exporting ? "正在生成…" : pdfUrl ? "重新生成 PDF" : "生成 PDF"}
            </Button> : null}
            {currentPdf ? (
              <>
                <Button asChild>
                  <a href={pdfUrl!} download={pdfName}>
                    下载 PDF
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={pdfUrl!} target="_blank" rel="noopener">
                    打开 PDF
                  </a>
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {pdfUrl && !currentPdf ? <p role="status" className="text-sm text-muted-foreground">设置已修改，请重新生成 PDF。</p> : null}
        <fieldset disabled={exporting} className="grid items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_12rem_minmax(0,1fr)]">
          <span className="text-sm text-muted-foreground">{sheetKind === "handout" ? "学案名" : "卷名"}</span>
          <Input aria-label={sheetKind === "handout" ? "学案名" : "卷名"} className="h-9" value={title} onChange={(e) => onTitle(e.target.value)} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <SheetKindToggle value={sheetKind} onChange={onSheetKind} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withAnswers}
                onChange={(e) => onAnswers(e.target.checked)}
              />
              附答案与解析
            </label>
            {sheetKind === "handout" && withAnswers ? <label className="flex items-center gap-2 text-sm">
              答案位置
              <select aria-label="答案位置" className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={answerPlacement} onChange={e => onAnswerPlacement(coerceAnswerPlacement(e.target.value))}>
                <option value="inline">答案随题</option>
                <option value="end">放在最后</option>
              </select>
            </label> : null}
            {!gaokaoTex ? <label className={cn("flex items-center gap-2 text-sm", inlineAnswers && "opacity-40")}>
              默认留白
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={blankLines}
                disabled={inlineAnswers}
                onChange={(e) => onBlankLines(coerceBlankLines(e.target.value))}
              >
                {BLANK_LINE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {blankLineLabel(n)}
                  </option>
                ))}
              </select>
            </label> : null}
            {!gaokaoTex ? <label className={cn("flex items-center gap-2 text-sm", inlineAnswers && "opacity-40")}>
              <input
                type="checkbox"
                checked={blankAuto}
                disabled={inlineAnswers}
                onChange={(e) => onBlankAuto(e.target.checked)}
              />
              自动留白
            </label> : null}
          </div>
        </fieldset>
        <fieldset disabled={exporting} className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            排版模板
            <select aria-label="排版模板" className="h-9 rounded-md border border-border bg-background px-2" value={gaokaoTex ? "gaokao" : "general"} onChange={e => { setTexTemplate(e.target.value as "general" | "gaokao"); if (e.target.value === "gaokao") onSheetKind("exam"); }}>
              <option value="general">通用</option>
              <option value="gaokao">高考数学 · exam-zh</option>
            </select>
          </label>
          {gaokaoTex ? <>
            <label className="flex items-center gap-2 text-sm">时长（分钟）
              <Input aria-label="LaTeX 考试时长" type="number" min={0} max={600} step={1} className="h-9 w-20" value={examMinutes} onChange={e => setExamMinutes(Number(e.target.value))} />
            </label>
            <label className="flex items-center gap-2 text-sm">解答留白（cm）
              <Input aria-label="LaTeX 解答留白" type="number" min={0} max={15} step={0.5} disabled={withAnswers} className="h-9 w-20" value={solutionSpace} onChange={e => setSolutionSpace(Number(e.target.value))} />
            </label>
          </> : null}
        </fieldset>
        <details className="text-sm"><summary className="w-fit cursor-pointer text-muted-foreground">高级选项</summary><div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="paper-template-name" className="text-sm text-muted-foreground">模板名称</label>
          <Input
            id="paper-template-name"
            className="h-9 w-full sm:w-60"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            placeholder="周六数学卷"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="justify-self-start"
            onClick={() => {
              saveTemplate({ name: tplName, title, withAnswers, answerPlacement, blankLines, blankAuto, sheetKind, rows });
              toast.success("模板已保存，组卷页可以打开");
            }}
          >
            保存模板
          </Button>
        </div></details>
      </div>

      <div className="exam-preview-wrap">
        {figureLoadError && !figuresReady ? <div role="alert" className="flex items-center justify-center gap-3 py-8 text-sm">
          配图读取失败<Button variant="outline" size="sm" onClick={onRetryFigures}>重试配图</Button>
        </div> : previewError ? <div role="alert" className="space-y-3 py-8 text-center"><p className="whitespace-pre-wrap">{previewError}</p>{gaokaoTex ? <Button variant="outline" onClick={() => { setCompiledPdf(null); setCompileRetry(n => n + 1); }}>重新排版</Button> : null}</div> : !previewReady ? (
          <div role="status" aria-live="polite" data-preview-loading
            className="no-print mx-auto flex min-h-64 w-full max-w-[794px] flex-col items-center justify-center gap-3 border border-border bg-white px-6 py-8 sm:min-h-80">
            <LoaderCircle aria-hidden="true" className="size-7 text-primary motion-safe:animate-spin" />
            <p className="text-base font-medium">正在生成预览</p>
            <p className="text-sm text-muted-foreground">
              {figuresReady ? `正在排版 ${items.filter((item) => item.kind === "problem").length} 道题…` : "正在读取配图…"}
            </p>
            <div aria-hidden="true" className="mt-3 w-full max-w-60 space-y-2 motion-safe:animate-pulse">
              <div className="h-2 w-full rounded-sm bg-secondary" />
              <div className="h-2 w-4/5 rounded-sm bg-secondary" />
              <div className="h-2 w-3/5 rounded-sm bg-secondary" />
            </div>
          </div>
        ) : null}
        {currentCompiled && !previewError ? <>
          {currentCompiled.warnings.length ? <details className="no-print mx-auto mb-4 max-w-[794px] text-sm"><summary className="cursor-pointer">{currentCompiled.warnings.length} 项内容核对提醒</summary><ul className="mt-2 list-inside list-disc">{currentCompiled.warnings.map(w => <li key={w}>{w}</li>)}</ul></details> : null}
          <LatexPdfPreview blob={currentCompiled.blob} onError={setPreviewError} />
        </> : null}
        {mountPreview && !gaokaoTex ? <ExamSheet
          title={title}
          groupName={groupName}
          dateLabel={dateLabel}
          items={items}
          withAnswers={withAnswers}
          answerPlacement={answerPlacement}
          blankLines={blankLines}
          blankAuto={blankAuto}
          sheetKind={sheetKind}
          localFonts
          onReady={onPreviewReady}
          onError={setPreviewError}
        /> : null}
      </div>
    </div>
  );
}
