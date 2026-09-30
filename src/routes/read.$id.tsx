import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FigureFrame } from "@/components/notebook/figure-frame";
import {
  ProblemNavigationScope,
  useProblemNavigationKey,
} from "@/components/notebook/problem-navigation";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getProblemFiguresFn } from "@/lib/problems/api";
import { MathText } from "@/lib/problems/math-text";
import { sortBySourceOrder } from "@/lib/problems/order";
import { useProblemStore } from "@/lib/problems/store";
import { stemSectionsWithFigures } from "@/lib/problems/subproblems";
import { MASTERY_LABEL, type Figure, type Mastery, type Problem } from "@/lib/problems/types";

export const Route = createFileRoute("/read/$id")({ component: GroupReadingPage });

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
  const items = useMemo(
    () =>
      problems
        .map((problem, index) => ({ problem, number: index + 1 }))
        .filter(({ problem }) => kind === "all" || problem.tags.includes(kind)),
    [problems, kind],
  );
  const ids = useMemo(() => items.map(({ problem }) => problem.id), [items]);
  const numberRefs = useRef(new Map<string, HTMLElement>());

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
        className="sticky top-14 z-20 flex flex-wrap items-center gap-x-5 gap-y-3 border-y border-border bg-surface px-3 py-3 sm:top-16"
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
        <BulkToggle
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
          className="h-9 min-w-0 max-w-full rounded-md border border-border bg-surface px-2 text-sm sm:ml-auto"
        >
          <option value="">跳转题目</option>
          {items.map(({ problem, number }) => (
            <option key={problem.id} value={problem.id}>
              第 {number} 题
            </option>
          ))}
        </select>
      </div>
      {!items.length ? (
        <p className="py-16 text-center text-muted-foreground">
          {problems.length ? "没有这一类题目" : "这个小组还没有题目"}
        </p>
      ) : null}
      <ProblemNavigationScope ids={ids}>
        <div className="divide-y divide-border">
          {items.map(({ problem, number }) => (
            <ReadingQuestion
              key={problem.id}
              problem={problem}
              number={number}
              register={(node) => {
                if (node) numberRefs.current.set(problem.id, node);
                else numberRefs.current.delete(problem.id);
              }}
              answerOpen={answers.has(problem.id)}
              analysisOpen={analyses.has(problem.id)}
              toggleSolution={() => {
                const open = !answers.has(problem.id) && !analyses.has(problem.id);
                const update = (selected: Set<string>) => {
                  const next = new Set(selected);
                  if (open) next.add(problem.id);
                  else next.delete(problem.id);
                  return next;
                };
                setAnswers(update);
                setAnalyses(update);
              }}
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

function ReadingQuestion({
  problem,
  number,
  register,
  answerOpen,
  analysisOpen,
  toggleSolution,
}: {
  problem: Problem;
  number: number;
  register: (node: HTMLElement | null) => void;
  answerOpen: boolean;
  analysisOpen: boolean;
  toggleSolution: () => void;
}) {
  const nodeRef = useRef<HTMLElement>(null);
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
      ref={(node) => {
        nodeRef.current = node;
        register(node);
      }}
      tabIndex={-1}
      aria-label={`第 ${number} 题`}
      data-reading-question={problem.id}
      className="min-w-0 scroll-mt-52 py-7 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:scroll-mt-36"
    >
      <header className="mb-4 flex items-center gap-1 text-sm sm:gap-2">
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
          {(["new", "reviewing", "mastered"] as Mastery[]).map((value) => (
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
              onClick={toggleSolution}
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
      <div className="space-y-4 break-words text-base">
        {content.sections.map((section, i) => (
          <div key={i}>
            <MathText text={section.text} className="overflow-x-auto overflow-y-hidden py-1 text-base font-normal" />
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
              <MathText text={problem.correctAnswer} className="overflow-x-auto overflow-y-hidden py-1" />
            ) : (
              <p className="text-sm text-muted-foreground">暂无答案</p>
            )}
          </section>
        ) : null}
        {analysisOpen ? (
          <section id={`analysis-${problem.id}`} className="mt-5 border-l-2 border-sky-700/40 bg-sky-50/70 px-4 py-3 text-sm text-sky-900 [&_.katex]:text-[1.05em]!">
            <h3 className="mb-2 text-sm font-semibold text-sky-800">解析</h3>
            {problem.analysis.trim() ? (
              <MathText text={problem.analysis} className="overflow-x-auto overflow-y-hidden py-1" />
            ) : (
              <p className="text-sm text-muted-foreground">暂无解析</p>
            )}
          </section>
        ) : null}
      </div>
    </article>
  );
}
