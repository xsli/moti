import { AddPracticeRecord, PracticeRecord } from "@/components/notebook/practice-record";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
  Star,
  SlidersHorizontal,
  ShoppingBasket,
  FileText,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FigureFrame } from "@/components/notebook/figure-frame";
import {
  ProblemNavigationScope,
  useProblemNavigationKey,
} from "@/components/notebook/problem-navigation";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePaperStore } from "@/lib/paper/store";
import { getProblemFiguresFn } from "@/lib/problems/api";
import { MathText } from "@/lib/problems/math-text";
import { sortBySourceOrder } from "@/lib/problems/order";
import { useProblemStore } from "@/lib/problems/store";
import { stemSectionsWithFigures } from "@/lib/problems/subproblems";
import { MASTERY_VALUES, MASTERY_LABEL, type Figure, type Mastery, type Problem } from "@/lib/problems/types";

export const Route = createFileRoute("/read/$id")({ component: GroupReadingPage });

const ReadingMathText = memo(MathText);

function GroupReadingPage() {
  const { id } = Route.useParams();
  const collection = useProblemStore((s) => s.collections.find((c) => c.id === id));
  const problems = useProblemStore((s) => s.problems);
  const status = useProblemStore((s) => s.status);
  const items = useMemo(
    () => sortBySourceOrder(problems.filter((p) => p.collectionId === id)),
    [problems, id],
  );

  if (!collection && (status === "idle" || status === "loading")) {
    return (
      <p role="status" className="flex items-center gap-2 py-12">
        <LoaderCircle className="size-4 animate-spin" />
        正在读取小组…
      </p>
    );
  }
  if (!collection) {
    return (
      <div className="space-y-4 py-12">
        <h1 className="text-xl font-semibold">
          {status === "error" ? "小组读取失败" : "找不到这个小组"}
        </h1>
        {status === "error" ? (
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RotateCcw />
            重试
          </Button>
        ) : null}
        <BackButton><Link to="/" /></BackButton>
      </div>
    );
  }
  return (
    <GroupReader
      key={id}
      id={id}
      title={collection.name}
      folder={collection.groupName}
      problems={items}
    />
  );
}

function GroupReader({
  id,
  title,
  folder,
  problems,
}: {
  id: string;
  title: string;
  folder: string;
  problems: Problem[];
}) {
  const [kind, setKind] = useState("all");
  const [answers, setAnswers] = useState<Set<string>>(() => new Set(problems.map((p) => p.id)));
  const [analyses, setAnalyses] = useState<Set<string>>(() => new Set(problems.map((p) => p.id)));
  const [jump, setJump] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [onlySelected, setOnlySelected] = useState(false);
  const addToBasket = usePaperStore((s) => s.addToBasket);
  const selectedIds = useMemo(
    () => problems.filter((p) => selected.has(p.id)).map((p) => p.id),
    [problems, selected],
  );
  const selectionFilter = onlySelected ? selected : null;
  const items = useMemo(
    () =>
      problems
        .map((problem, index) => ({ problem, number: index + 1 }))
        .filter(({ problem }) =>
          (kind === "all" || problem.tags.includes(kind)) &&
          (!selectionFilter || selectionFilter.has(problem.id))),
    [problems, kind, selectionFilter],
  );
  const ids = useMemo(() => items.map(({ problem }) => problem.id), [items]);
  const numberRefs = useRef(new Map<string, HTMLElement>());
  const toolbarRef = useRef<HTMLDivElement>(null);
  const registerQuestion = useCallback((problemId: string, node: HTMLElement | null) => {
    if (node) numberRefs.current.set(problemId, node);
    else numberRefs.current.delete(problemId);
  }, []);
  const selectQuestion = useCallback((problemId: string, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(problemId);
      else next.delete(problemId);
      return next;
    });
  }, []);
  const setSolutionOpen = useCallback((problemId: string, open: boolean) => {
    const update = (previous: Set<string>) => {
      const next = new Set(previous);
      if (open) next.add(problemId);
      else next.delete(problemId);
      return next;
    };
    setAnswers(update);
    setAnalyses(update);
  }, []);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    // Selection actions and narrow screens change the sticky toolbar's height.
    const updateOffset = () => {
      const top = Number.parseFloat(getComputedStyle(toolbar).top) || 0;
      toolbar.parentElement?.style.setProperty(
        "--reading-scroll-offset", `${toolbar.offsetHeight + top + 12}px`,
      );
    };
    const observer = new ResizeObserver(updateOffset);
    observer.observe(toolbar);
    window.addEventListener("resize", updateOffset);
    updateOffset();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateOffset);
    };
  }, []);

  function toggleAll(set: Set<string>, checked: boolean) {
    const next = new Set(set);
    for (const problemId of ids) {
      if (checked) next.add(problemId);
      else next.delete(problemId);
    }
    return next;
  }

  return (
    <div className="min-w-0">
      <BackButton className="mb-4"><Link to="/" search={{ g: id }} /></BackButton>
      <header className="mb-5 space-y-2">
        <p className="text-sm text-muted-foreground">{folder}</p>
        <h1 className="break-words font-display text-2xl font-semibold">{title}</h1>
      </header>
      <div
        ref={toolbarRef}
        className="sticky top-14 z-20 flex flex-wrap items-center gap-2 border-y border-border bg-surface px-2 py-2 sm:top-16"
        aria-label="阅读设置"
      >
        <select
          aria-label="题目类型"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setJump("");
          }}
          className="h-9 max-w-full rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="all">全部题目</option>
          <option value="例题">例题</option>
          <option value="习题">习题</option>
        </select>
        <Button variant="ghost" size="icon" aria-label="显示设置" title="显示设置" onClick={() => setSettingsOpen(true)}><SlidersHorizontal /></Button>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent><DialogHeader><DialogTitle>显示设置</DialogTitle></DialogHeader><div className="flex flex-wrap gap-6 py-3"><BulkToggle
          label="显示答案"
          ids={ids}
          selected={answers}
          onChange={(checked) => setAnswers((s) => toggleAll(s, checked))}
        />
        <BulkToggle
          label="显示解析"
          ids={ids}
          selected={analyses}
          onChange={(checked) => setAnalyses((s) => toggleAll(s, checked))}
        />
        </div><Button className="self-end" onClick={() => setSettingsOpen(false)}>完成</Button></DialogContent></Dialog>
        <select
          aria-label="跳转题目"
          value={jump}
          disabled={!items.length}
          onChange={(e) => {
            setJump(e.target.value);
            const element = numberRefs.current.get(e.target.value);
            element?.scrollIntoView({ block: "start", behavior: "instant" });
            element?.focus({ preventScroll: true });
          }}
          className="ml-auto h-9 min-w-0 max-w-full rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="">跳转题目</option>
          {items.map(({ problem, number }) => (
            <option key={problem.id} value={problem.id}>
              第 {number} 题
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
        <BulkToggle label="全选当前" ids={ids} selected={selected}
          onChange={(checked) => setSelected((s) => toggleAll(s, checked))} />
        <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={onlySelected}
            onChange={(e) => { setOnlySelected(e.target.checked); setJump(""); }} />
          只看已选
        </label>
        </div>
        {selectedIds.length > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-border pt-2" aria-label="已选题目操作">
            <span role="status" className="text-sm tabular-nums text-primary">已选 {selectedIds.length} 道</span>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="清空阅读选择" onClick={() => {
                setSelected(new Set()); setOnlySelected(false); setJump("");
              }}><X /></Button>
            </TooltipTrigger><TooltipContent>清空选择（不影响组卷篮）</TooltipContent></Tooltip>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => {
              const count = addToBasket(selectedIds);
              toast.success(count ? `已加入组卷篮 ${count} 道` : "题目已在组卷篮中，或已达选题上限");
            }}><ShoppingBasket />加入组卷篮</Button>
            <Button asChild size="sm">
              <Link to="/paper" search={{ ids: selectedIds.join(","), tpl: "", title, sheet: "handout" }}>
                <FileText />组卷
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
      {!items.length ? (
        <p className="py-16 text-center text-muted-foreground">
          {onlySelected ? "当前范围没有已选题目" : problems.length ? "没有这一类题目" : "这个小组还没有题目"}
        </p>
      ) : null}
      <ProblemNavigationScope ids={ids}>
        <div className="divide-y divide-border">
          {items.map(({ problem, number }) => (
            <ReadingQuestion
              key={problem.id}
              problem={problem}
              number={number}
              selected={selected.has(problem.id)}
              onSelect={selectQuestion}
              register={registerQuestion}
              answerOpen={answers.has(problem.id)}
              analysisOpen={analyses.has(problem.id)}
              setSolutionOpen={setSolutionOpen}
            />
          ))}
        </div>
      </ProblemNavigationScope>
    </div>
  );
}

function BulkToggle({
  label,
  ids,
  selected,
  onChange,
}: {
  label: string;
  ids: string[];
  selected: Set<string>;
  onChange: (checked: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const count = ids.filter((id) => selected.has(id)).length;
  useEffect(() => {
    if (input.current) input.current.indeterminate = count > 0 && count < ids.length;
  }, [count, ids.length]);
  return (
    <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm">
      <input
        ref={input}
        type="checkbox"
        className="size-4 accent-primary"
        checked={ids.length > 0 && count === ids.length}
        disabled={!ids.length}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

const ReadingQuestion = memo(function ReadingQuestion({
  problem,
  number,
  selected,
  onSelect,
  register,
  answerOpen,
  analysisOpen,
  setSolutionOpen,
}: {
  problem: Problem;
  number: number;
  selected: boolean;
  onSelect: (problemId: string, checked: boolean) => void;
  register: (problemId: string, node: HTMLElement | null) => void;
  answerOpen: boolean;
  analysisOpen: boolean;
  setSolutionOpen: (problemId: string, open: boolean) => void;
}) {
  const nodeRef = useRef<HTMLElement>(null);
  const registerNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    register(problem.id, node);
  }, [problem.id, register]);
  const [nearby, setNearby] = useState(false);
  const [loadedFigures, setLoadedFigures] = useState<Figure[] | null>(null);
  const [figureError, setFigureError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const updateProblem = useProblemStore((s) => s.updateProblem);
  const browse = useProblemNavigationKey();
  const solutionOpen = answerOpen || analysisOpen;
  const solutionLabel = solutionOpen ? "收起答案与解析" : "展开答案与解析";
  const needsFigures = problem.figures.some((figure) => !figure.image && !figure.svg);

  useEffect(() => {
    if (!nodeRef.current || nearby) return;
    if (!("IntersectionObserver" in window)) {
      setNearby(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearby(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(nodeRef.current);
    return () => observer.disconnect();
  }, [nearby]);

  useEffect(() => {
    if (!nearby || !needsFigures) return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    setFigureError(false);
    void getProblemFiguresFn({ data: { id: problem.id }, signal: controller.signal })
      .then((figures) => {
        if (!active) return;
        if (!figures) setFigureError(true);
        else setLoadedFigures(figures);
      })
      .catch(() => {
        if (active) setFigureError(true);
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [nearby, needsFigures, problem.id, problem.updatedAt, attempt]);

  const figures = needsFigures ? (loadedFigures ?? problem.figures) : problem.figures;
  const content = useMemo(
    () => stemSectionsWithFigures(problem.stem, figures),
    [problem.stem, figures],
  );
  function renderFigure(figure: Figure) {
    return figure.image || figure.svg ? (
      <FigureFrame
        key={figure.id}
        image={figure.image}
        svg={figure.svg}
        caption={figure.caption || figure.title}
        className="mx-auto mt-4 max-w-lg"
      />
    ) : (
      <div
        key={figure.id}
        className="my-4 flex min-h-32 items-center justify-center gap-2 bg-secondary/40 text-sm text-muted-foreground"
      >
        {figureError ? (
          "配图加载失败"
        ) : (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            配图加载中…
          </>
        )}
      </div>
    );
  }

  return (
    <article
      ref={registerNode}
      tabIndex={-1}
      aria-label={`第 ${number} 题`}
      data-reading-question={problem.id}
      className="min-w-0 scroll-mt-[var(--reading-scroll-offset,13rem)] py-7 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <header className="mb-4 flex items-center gap-1 text-sm sm:gap-2">
        <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center" title={selected ? "取消选择" : "选择题目"}>
          <input type="checkbox" className="size-4 accent-primary" checked={selected}
            aria-label={`选择第 ${number} 题`} onChange={(e) => onSelect(problem.id, e.target.checked)} />
        </label>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 sm:gap-2">
        <h2 className="mr-1 font-semibold">第 {number} 题</h2>
        {problem.tags
          .filter((tag) => tag === "例题" || tag === "习题")
          .map((tag) => (
            <span key={tag} className="text-primary">
              {tag}
            </span>
          ))}
        <span
          aria-label={`难度 ${problem.difficulty} 星`}
          role="img"
          className="flex shrink-0 items-center gap-0.5 text-primary"
        >
          {Array.from({ length: problem.difficulty }, (_, index) => (
            <Star key={index} aria-hidden="true" className="size-3.5 fill-current" />
          ))}
        </span>
        </div>
        <select
          aria-label={`第 ${number} 题掌握状态`}
          value={problem.mastery}
          className="h-9 shrink-0 rounded-md border border-border bg-surface px-1 text-sm sm:px-2"
          onChange={(e) => void updateProblem(problem.id, { mastery: e.target.value as Mastery })}
        >
          {MASTERY_VALUES.map((value) => (
            <option key={value} value={value}>
              {MASTERY_LABEL[value]}
            </option>
          ))}
        </select>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={solutionLabel}
              aria-expanded={solutionOpen}
              aria-controls={`solution-${problem.id}`}
              onClick={() => setSolutionOpen(problem.id, !solutionOpen)}
            >
              {solutionOpen ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{solutionLabel}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" className="size-8 shrink-0">
              <Link
                to="/p/$id"
                params={{ id: problem.id }}
                search={{ browse }}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`打开第 ${number} 题详情（新标签页）`}
              >
                <ExternalLink />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>打开题目详情（新标签页）</TooltipContent>
        </Tooltip>
      </header>
      <div className="mb-4"><AddPracticeRecord key={`practice-${problem.id}`} problem={problem} /></div>
      <PracticeRecord key={problem.id} problem={problem} />
      <div className="space-y-4 break-words text-base">
        {content.sections.map((section, i) => (
          <div key={i}>
            <ReadingMathText text={section.text} figures={figures} scrollHints className="overflow-x-auto overflow-y-hidden py-1 text-base font-normal" />
            {section.figures.map(renderFigure)}
          </div>
        ))}
        {content.trailingFigures.map(renderFigure)}
      </div>
      {figureError ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAttempt((n) => n + 1)}>
          <RotateCcw />
          重试配图
        </Button>
      ) : null}
      <div id={`solution-${problem.id}`} className="break-words">
        {answerOpen ? (
          <section id={`answer-${problem.id}`} className="mt-3 border-l-2 border-emerald-700/40 bg-emerald-50/70 px-4 py-3 text-lg text-emerald-900">
            <h3 className="mb-2 text-sm font-semibold text-emerald-800">答案</h3>
            {problem.correctAnswer.trim() ? (
              <ReadingMathText text={problem.correctAnswer} figures={figures} scrollHints className="overflow-x-auto overflow-y-hidden py-1" />
            ) : (
              <p className="text-sm text-muted-foreground">暂无答案</p>
            )}
          </section>
        ) : null}
        {analysisOpen ? (
          <section id={`analysis-${problem.id}`} className="mt-5 border-l-2 border-sky-700/40 bg-sky-50/70 px-4 py-3 text-sm text-sky-900 [&_.katex]:text-[1.05em]!">
            <h3 className="mb-2 text-sm font-semibold text-sky-800">解析</h3>
            {problem.analysis.trim() ? (
              <ReadingMathText text={problem.analysis} figures={figures} tight scrollHints className="overflow-x-auto overflow-y-hidden py-1" />
            ) : (
              <p className="text-sm text-muted-foreground">暂无解析</p>
            )}
          </section>
        ) : null}
      </div>
    </article>
  );
});
