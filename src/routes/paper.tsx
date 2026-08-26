import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ProblemCard } from "@/components/notebook/problem-card";
import { ArrangeList } from "@/components/paper/arrange-list";
import { BasketBar } from "@/components/paper/basket-bar";
import { ExamSheet } from "@/components/paper/exam-sheet";
import { TemplateList } from "@/components/paper/template-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveExamItems, rowsFromIds, type PaperRow } from "@/lib/paper/layout";
import { buildExamLatex } from "@/lib/paper/latex";
import { buildExamPdf } from "@/lib/paper/pdf";
import { applyTemplateRows } from "@/lib/paper/session";
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
import { useProblemStore } from "@/lib/problems/store";
import { SUBJECT_LABEL, SUBJECTS, type Subject } from "@/lib/problems/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/paper")({
  validateSearch: (search: Record<string, unknown>) => ({
    ids: typeof search.ids === "string" ? search.ids : "",
    tpl: typeof search.tpl === "string" ? search.tpl : "",
  }),
  component: PaperPage,
});

function PaperPage() {
  const { ids, tpl } = Route.useSearch();
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
  const [title, setTitle] = useState("错题练习卷");
  const [withAnswers, setWithAnswers] = useState(false);
  const [blankLines, setBlankLines] = useState<BlankLines>(DEFAULT_BLANK_LINES);
  const [blankAuto, setBlankAuto] = useState(false);
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
      setTitle(template.title || "错题练习卷");
      setWithAnswers(template.withAnswers);
      setBlankLines(coerceBlankLines(template.blankLines));
      setBlankAuto(coerceBlankAuto(template.blankAuto, template.blankLines));
      setStep("arrange");
      return;
    }
    setRows(rowsFromIds(selectedIds));
    setTitle("错题练习卷");
    setWithAnswers(false);
    setBlankLines(DEFAULT_BLANK_LINES);
    setBlankAuto(false);
    setStep("arrange");
  }, [idsKey, tpl, tplStamp, selectedIds]);

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
        onChange={setRows}
        onApplyMeta={({ title: nextTitle, withAnswers: nextAnswers, blankLines: nextBlank, blankAuto: nextAuto }) => {
          setTitle(nextTitle);
          setWithAnswers(nextAnswers);
          setBlankLines(nextBlank);
          setBlankAuto(nextAuto);
        }}
        onNext={() => setStep("preview")}
        onBack={() => navigate({ to: "/paper", search: { ids: "", tpl: "" } })}
      />
    );
  }

  return (
    <PaperPreview
      items={resolveExamItems(rows, selected)}
      rows={rows}
      title={title}
      withAnswers={withAnswers}
      blankLines={blankLines}
      blankAuto={blankAuto}
      onTitle={setTitle}
      onAnswers={setWithAnswers}
      onBlankLines={setBlankLines}
      onBlankAuto={setBlankAuto}
      onBack={() => setStep("arrange")}
    />
  );
}

function PaperPicker() {
  const problems = useProblemStore((s) => s.problems);
  const navigate = useNavigate();
  const addToBasket = usePaperStore((s) => s.addToBasket);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<"all" | Subject>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [dateDay, setDateDay] = useState("");
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of problems) for (const t of p.tags) set.add(t);
    return [...set];
  }, [problems]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return problems.filter((p) => {
      if (filter !== "all" && p.subject !== filter) return false;
      if (!matchesDateFilter(p.createdAt, dateFilter, dateDay)) return false;
      if (tag && !p.tags.includes(tag)) return false;
      if (!q) return true;
      return `${p.title} ${p.stem} ${p.tags.join(" ")}`.toLowerCase().includes(q);
    });
  }, [problems, filter, dateFilter, dateDay, tag, query]);

  const hiddenPicked = useMemo(
    () => problems.filter((p) => picked.has(p.id) && !visible.some((v) => v.id === p.id)),
    [problems, picked, visible],
  );
  const allVisibleSelected = visible.length > 0 && visible.every((p) => picked.has(p.id));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setPicked((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const p of visible) next.delete(p.id);
      } else {
        for (const p of visible) next.add(p.id);
      }
      return next;
    });
  }

  const chips: { id: "all" | Subject; label: string }[] = [
    { id: "all", label: "全部科目" },
    ...SUBJECTS.map((s) => ({ id: s as "all" | Subject, label: SUBJECT_LABEL[s] })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">组卷</h1>
        <p className="mt-1 text-sm text-muted-foreground">篮子里攒题，模板记住排版。筛选不影响已选。</p>
      </div>

      <BasketBar />
      <TemplateList />

      <div className="flex flex-col gap-3">
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
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setFilter(chip.id)}
              className={cn(
                "h-9 shrink-0 rounded-full px-3.5 text-sm transition-colors",
                filter === chip.id ? "bg-fg text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-fg",
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
                dateFilter === id ? "bg-fg text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-fg",
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
        {allTags.length ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTag("")}
              className={cn(
                "h-9 shrink-0 rounded-full px-3.5 text-sm transition-colors",
                !tag ? "bg-fg text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-fg",
              )}
            >
              全部标签
            </button>
            {allTags.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTag((prev) => (prev === item ? "" : item))}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3.5 text-sm transition-colors",
                  tag === item ? "bg-fg text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-fg",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="sticky top-16 z-10 flex flex-col gap-2 rounded-xl bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="text-sm text-muted-foreground hover:text-fg" onClick={toggleVisible} disabled={!visible.length}>
            {allVisibleSelected ? "取消当前全选" : "全选当前"}
          </button>
          <span className="text-sm text-muted-foreground">已选 {picked.size}</span>
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
                const n = addToBasket([...picked]);
                toast.success(n ? `已放入组卷篮 ${n} 道` : "这些题已在篮子里");
              }}
            >
              加入组卷篮
            </Button>
            <Button
              size="sm"
              disabled={!picked.size}
              onClick={() => navigate({ to: "/paper", search: { ids: [...picked].join(","), tpl: "" } })}
            >
              去排版
            </Button>
          </div>
        </div>
        {hiddenPicked.length ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
            <span className="text-xs text-muted-foreground">不在当前筛选里，仍会进卷</span>
            {hiddenPicked.map((p) => (
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
          </div>
        ) : null}
      </div>

      {problems.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">本子还是空的。</p>
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">当前筛选没有题目。已选 {picked.size} 道仍保留。</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((problem) => (
            <ProblemCard
              key={problem.id}
              problem={problem}
              selecting
              selected={picked.has(problem.id)}
              onToggle={() => toggle(problem.id)}
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
  onTitle,
  onAnswers,
  onBlankLines,
  onBlankAuto,
  onBack,
}: {
  items: ReturnType<typeof resolveExamItems>;
  rows: PaperRow[];
  title: string;
  withAnswers: boolean;
  blankLines: BlankLines;
  blankAuto: boolean;
  onTitle: (value: string) => void;
  onAnswers: (value: boolean) => void;
  onBlankLines: (value: BlankLines) => void;
  onBlankAuto: (value: boolean) => void;
  onBack: () => void;
}) {
  const saveTemplate = usePaperStore((s) => s.saveTemplate);
  const [tplName, setTplName] = useState(title);
  const [exporting, setExporting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfBlob = useRef<Blob | null>(null);
  const dateLabel = formatLoggedDateLong(Date.now());

  function downloadTex() {
    const tex = buildExamLatex(items, { title, dateLabel, withAnswers, blankLines, blankAuto });
    const blob = new Blob([tex], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.tex`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast.success("已下载 TeX，用 XeLaTeX 编译");
  }

  async function generatePdf() {
    setExporting(true);
    try {
      const blob = await buildExamPdf([], { title, dateLabel, withAnswers });
      pdfBlob.current = blob;
      const url = URL.createObjectURL(blob);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      toast.success("PDF 已生成，请点下载");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "PDF 生成失败");
    } finally {
      setExporting(false);
    }
  }

  async function savePdf() {
    const blob = pdfBlob.current;
    if (!blob) {
      toast.error("请先生成 PDF");
      return;
    }
    const name = `${title}.pdf`;
    try {
      const picker = (
        window as Window & {
          showSaveFilePicker?: (options: {
            suggestedName: string;
            types: { description: string; accept: Record<string, string[]> }[];
          }) => Promise<FileSystemFileHandle>;
        }
      ).showSaveFilePicker;
      if (picker) {
        const handle = await picker({
          suggestedName: name,
          types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        toast.success("已保存到电脑");
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }

    const url = pdfUrl ?? URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success("已开始下载");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">预览试卷</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A4 · {items.filter((item) => item.kind === "problem").length} 道 · 先生成 PDF，再下载
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onBack}>
              返回排版
            </Button>
            <Button variant="outline" onClick={downloadTex}>
              下载 TeX
            </Button>
            <Button onClick={() => void generatePdf()} disabled={exporting}>
              {exporting ? "正在生成…" : "生成 PDF"}
            </Button>
            {pdfUrl ? (
              <Button type="button" onClick={() => void savePdf()}>
                下载 PDF
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            卷名
            <Input value={title} onChange={(e) => onTitle(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withAnswers}
              onChange={(e) => onAnswers(e.target.checked)}
            />
            解析版
          </label>
          <label className={cn("flex items-center gap-2 text-sm", withAnswers && "opacity-40")}>
            答题留白
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
            自动估（没答案就用上面行数）
          </label>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            存为模板
            <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="周六数学卷" />
          </label>
          <Button
            type="button"
            variant="outline"
            className="sm:mt-5"
            onClick={() => {
              saveTemplate({ name: tplName, title, withAnswers, blankLines, blankAuto, rows });
              toast.success("模板已保存，组卷页可以打开");
            }}
          >
            保存模板
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
        />
      </div>
    </div>
  );
}
