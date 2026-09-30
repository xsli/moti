import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FilterMenu, DateMenu } from "@/components/notebook/filter-menu";
import { ProblemCard } from "@/components/notebook/problem-card";
import { TagFilter } from "@/components/notebook/tag-filter";
import { ArrangeList, SheetKindToggle } from "@/components/paper/arrange-list";
import { BasketBar } from "@/components/paper/basket-bar";
import { ExamSheet } from "@/components/paper/exam-sheet";
import { TemplateList } from "@/components/paper/template-list";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Input } from "@/components/ui/input";
import { resolveExamItems, rowsFromIds, type PaperRow, type SheetKind } from "@/lib/paper/layout";
import { buildExamLatex } from "@/lib/paper/latex";
import { buildExamPdf } from "@/lib/paper/pdf";
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
  const [blankLines, setBlankLines] = useState<BlankLines>(DEFAULT_BLANK_LINES);
  const [blankAuto, setBlankAuto] = useState(false);
  const [sheetKind, setSheetKind] = useState<SheetKind>("exam");
  const [step, setStep] = useState<"arrange" | "preview">("arrange");

  useEffect(() => {
    for (const id of selectedIds) void loadProblem(id);
  }, [selectedIds, loadProblem]);

  useEffect(() => {
    const template = usePaperStore.getState().templates.find((item) => item.id === tpl);
    if (template) {
      const available = new Set(selectedIds);
      const nextRows = applyTemplateRows(template.rows, available);
      setRows(nextRows.length ? nextRows : rowsFromIds(selectedIds));
      setTitle(normalizePaperTitle(template.title, template.sheetKind));
      setWithAnswers(template.withAnswers);
      setBlankLines(coerceBlankLines(template.blankLines));
      setBlankAuto(coerceBlankAuto(template.blankAuto, template.blankLines));
      setSheetKind(template.sheetKind === "handout" ? "handout" : "exam");
      setStep("arrange");
      return;
    }
    const nextSheetKind: SheetKind = initialSheetKind === "handout" ? "handout" : "exam";
    const nextRows = rowsFromIds(selectedIds);
    setRows(
      nextSheetKind === "handout"
        ? [{ kind: "heading", id: crypto.randomUUID(), title: "\u7ec3\u4e60", perScore: 0, blankLines: 6 }, ...nextRows]
        : nextRows,
    );
    setTitle(normalizePaperTitle(initialTitle, nextSheetKind));
    setWithAnswers(false);
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
        <p className="font-display text-2xl font-semibold">这些题目不在本子里</p>
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
          if (kind === "handout" && !rows.some((row) => row.kind === "heading")) {
            setRows([
              { kind: "heading", id: crypto.randomUUID(), title: "练习", perScore: 0, blankLines: 6 },
              ...rows,
            ]);
          }
        }}
        onChange={setRows}
        onApplyMeta={({ title: nextTitle, withAnswers: nextAnswers, blankLines: nextBlank, blankAuto: nextAuto, sheetKind: nextKind }) => {
          setTitle(nextTitle);
          setWithAnswers(nextAnswers);
          setBlankLines(nextBlank);
          setBlankAuto(nextAuto);
          setSheetKind(nextKind);
        }}
        onNext={() => setStep("preview")}
        onBack={() => navigate({ to: "/paper", search: { ids: "", tpl: "" } })}
      />
    );
  }

  return (
    <PaperPreview
      items={resolveExamItems(rows, selected, blankLines, sheetKind)}
      rows={rows}
      title={title}
      withAnswers={withAnswers}
      blankLines={blankLines}
      blankAuto={blankAuto}
      sheetKind={sheetKind}
      onTitle={setTitle}
      onAnswers={setWithAnswers}
      onBlankLines={setBlankLines}
      onBlankAuto={setBlankAuto}
      onSheetKind={(kind) => {
        setSheetKind(kind);
        if (kind === "handout" && title === DEFAULT_EXAM_TITLE) setTitle(DEFAULT_HANDOUT_TITLE);
        if (kind === "exam" && title === DEFAULT_HANDOUT_TITLE) setTitle(DEFAULT_EXAM_TITLE);
        if (kind === "handout" && !rows.some((row) => row.kind === "heading")) {
          setRows([
            { kind: "heading", id: crypto.randomUUID(), title: "练习", perScore: 0, blankLines: 6 },
            ...rows,
          ]);
        }
      }}
      onBack={() => setStep("arrange")}
    />
  );
}

const PICKER_PAGE_SIZE = 24;

const PickerCard = memo(function PickerCard({ problem, selected, onToggle }: {
  problem: Problem; selected: boolean; onToggle: (id: string) => void;
}) {
  return <ProblemCard problem={problem} selecting selected={selected} onToggle={() => onToggle(problem.id)} />;
});

function PaperPicker() {
  const problems = useProblemStore((s) => s.problems);
  const collections = useProblemStore((s) => s.collections);
  const status = useProblemStore((s) => s.status);
  const navigate = useNavigate();
  const addToBasket = usePaperStore((s) => s.addToBasket);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
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
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function goToPage(next: number) {
    setPage(next);
    pagerRef.current?.scrollIntoView({ block: "start" });
  }

  function toggleVisible() {
    setPicked((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const p of pageItems) next.delete(p.id);
      } else {
        for (const p of pageItems) next.add(p.id);
      }
      return next;
    });
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
    <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">组卷</h1>
        </div>

      <BasketBar />
      <TemplateList />

      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <select aria-label="选题大组" value={folder === null ? "" : JSON.stringify(folder)}
            className="h-10 min-w-0 w-full rounded-md border border-border bg-surface px-3 text-sm"
            onChange={(e) => { setFolder(e.target.value ? JSON.parse(e.target.value) as string : null); setGroup(""); setTags([]); }}>
            <option value="">全部大组</option>
            {folders.map((name) => <option key={name} value={JSON.stringify(name)}>{name || UNGROUPED_FOLDER}</option>)}
          </select>
          <select aria-label="选题小组" value={group}
            className="h-10 min-w-0 w-full rounded-md border border-border bg-surface px-3 text-sm"
            onChange={(e) => { setGroup(e.target.value); setTags([]); }}>
            <option value="">全部小组</option>
            {folder === null ? <option value="ungrouped">未分组题目</option> : null}
            {groups.map((c) => <option key={c.id} value={c.id}>{folder === null ? `${c.groupName || UNGROUPED_FOLDER} / ` : ""}{c.name}</option>)}
          </select>
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
          <TagFilter tags={allTags} value={tags} onChange={setTags} />
          <FilterMenu
            idleLabel="掌握状态"
            emptyValue="all"
            value={mastery}
            options={masteryOptions}
            onChange={setMastery}
          />
        </div>
      </div>

      <div ref={pagerRef} className="sticky top-14 z-10 flex scroll-mt-16 flex-col gap-2 border-y border-border bg-surface px-3 py-2 sm:top-16">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="text-sm text-muted-foreground hover:text-fg" onClick={toggleVisible} disabled={!pageItems.length || searching}>
            {allVisibleSelected ? "取消本页全选" : "全选本页"}
          </button>
          <span className="text-sm text-muted-foreground">已选 {picked.size}</span>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} />只看已选
          </label>
          {picked.size ? (
            <button type="button" className="text-sm text-muted-foreground hover:text-fg" onClick={() => setPicked(new Set())}>
              清空已选
            </button>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!picked.size}
              onClick={() => {
                const n = addToBasket(idsInSourceOrder(problems, picked));
                toast.success(n ? `已放入组卷篮 ${n} 道` : "这些题已在篮子里");
              }}
            >
              加入组卷篮
            </Button>
            <Button
              size="sm"
              disabled={!picked.size}
              onClick={() => navigate({ to: "/paper", search: { ids: idsInSourceOrder(problems, picked).join(","), tpl: "" } })}
            >
              去排版
            </Button>
          </div>
        </div>
        <nav aria-label="选题分页" className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
          <span className="text-xs text-muted-foreground" role="status">
            {searching ? "搜索中…" : `共 ${results.length} 道 · ${results.length ? (currentPage - 1) * PICKER_PAGE_SIZE + 1 : 0}–${Math.min(currentPage * PICKER_PAGE_SIZE, results.length)}`}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="上一页" title="上一页" disabled={currentPage <= 1 || searching} onClick={() => goToPage(currentPage - 1)}><ChevronLeft /></Button>
            <select aria-label="选题页码" className="h-9 max-w-28 rounded-md border border-border bg-surface px-2 text-sm tabular-nums"
              value={currentPage} disabled={!results.length || searching} onChange={(e) => goToPage(Number(e.target.value))}>
              {Array.from({ length: pageCount }, (_, index) => <option key={index} value={index + 1}>{index + 1} / {pageCount} 页</option>)}
            </select>
            <Button variant="ghost" size="icon" aria-label="下一页" title="下一页" disabled={currentPage >= pageCount || searching} onClick={() => goToPage(currentPage + 1)}><ChevronRight /></Button>
          </div>
        </nav>
        {hiddenPicked.length ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
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
        <p className="py-12 text-center text-sm text-muted-foreground">本子还是空的。</p>
      ) : results.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">当前筛选没有题目。已选 {picked.size} 道仍保留。</p>
      ) : (
        <div aria-label="选题列表" aria-busy={searching} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((problem) => (
            <PickerCard
              key={problem.id}
              problem={problem}
              selected={picked.has(problem.id)}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PaperPreview({
  items,
  rows,
  title,
  withAnswers,
  blankLines,
  blankAuto,
  sheetKind,
  onTitle,
  onAnswers,
  onBlankLines,
  onBlankAuto,
  onSheetKind,
  onBack,
}: {
  items: ReturnType<typeof resolveExamItems>;
  rows: PaperRow[];
  title: string;
  withAnswers: boolean;
  blankLines: BlankLines;
  blankAuto: boolean;
  sheetKind: SheetKind;
  onTitle: (value: string) => void;
  onAnswers: (value: boolean) => void;
  onBlankLines: (value: BlankLines) => void;
  onBlankAuto: (value: boolean) => void;
  onSheetKind: (kind: SheetKind) => void;
  onBack: () => void;
}) {
  const saveTemplate = usePaperStore((s) => s.saveTemplate);
  const [tplName, setTplName] = useState(title);
  const [exporting, setExporting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const dateLabel = formatLoggedDateLong(Date.now());
  const pdfStem = paperFileStem(withAnswers && !title.trim().endsWith("解析版") ? `${title}-解析版` : title);
  const pdfName = `${pdfStem}.pdf`;

  function downloadTex() {
    const tex = buildExamLatex(items, { title, dateLabel, withAnswers, blankLines, blankAuto, sheetKind });
    const blob = new Blob([tex], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${paperFileStem(title)}.tex`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast.success("已下载 TeX，用 XeLaTeX 编译");
  }

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
    setExporting(true);
    try {
      const blob = await buildExamPdf([], { title, dateLabel, withAnswers });
      const url = URL.createObjectURL(blob);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
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
      <div className="no-print flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{sheetKind === "handout" ? "预览学案" : "预览试卷"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A4 · {items.filter((item) => item.kind === "problem").length} 道 · 先生成 PDF，再下载
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <BackButton onClick={onBack} title="返回排版" />
            <Button variant="outline" onClick={downloadTex}>
              下载 TeX
            </Button>
            <Button onClick={() => void generatePdf()} disabled={exporting}>
              {exporting ? "正在生成…" : "生成 PDF"}
            </Button>
            {pdfUrl ? (
              <>
                <Button asChild>
                  <a href={pdfUrl} download={pdfName}>
                    下载 PDF
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={pdfUrl} target="_blank" rel="noopener">
                    打开 PDF
                  </a>
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <div className="grid items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_12rem_minmax(0,1fr)]">
          <span className="text-sm text-muted-foreground">{sheetKind === "handout" ? "学案名" : "卷名"}</span>
          <Input className="h-9" value={title} onChange={(e) => onTitle(e.target.value)} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <SheetKindToggle value={sheetKind} onChange={onSheetKind} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withAnswers}
                onChange={(e) => onAnswers(e.target.checked)}
              />
              解析版
            </label>
            <label className={cn("flex items-center gap-2 text-sm", withAnswers && "opacity-40")}>
              默认留白
              <select
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={blankLines}
                disabled={withAnswers}
                onChange={(e) => onBlankLines(coerceBlankLines(e.target.value))}
              >
                {BLANK_LINE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {blankLineLabel(n)}
                  </option>
                ))}
              </select>
            </label>
            <label className={cn("flex items-center gap-2 text-sm", withAnswers && "opacity-40")}>
              <input
                type="checkbox"
                checked={blankAuto}
                disabled={withAnswers}
                onChange={(e) => onBlankAuto(e.target.checked)}
              />
              自动估
            </label>
          </div>
          <span className="text-sm text-muted-foreground">模板</span>
          <Input
            className="h-9"
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
              saveTemplate({ name: tplName, title, withAnswers, blankLines, blankAuto, sheetKind, rows });
              toast.success("模板已保存，组卷页可以打开");
            }}
          >
            保存
          </Button>
        </div>
      </div>

      <div className="exam-preview-wrap">
        <ExamSheet
          title={title}
          dateLabel={dateLabel}
          items={items}
          withAnswers={withAnswers}
          blankLines={blankLines}
          blankAuto={blankAuto}
          sheetKind={sheetKind}
        />
      </div>
    </div>
  );
}
