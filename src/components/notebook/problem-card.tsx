import { Link } from "@tanstack/react-router";
import { useProblemNavigationKey } from "@/components/notebook/problem-navigation";
import { Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FigureFrame } from "@/components/notebook/figure-frame";
import { MathText } from "@/lib/problems/math-text";
import { tagsForDisplay } from "@/lib/problems/tags";
import { MASTERY_VALUES, MASTERY_LABEL, SUBJECT_LABEL, type Mastery, type Problem } from "@/lib/problems/types";
import { cn } from "@/lib/utils";

import { PracticeSummary } from "./practice-record";

export function ProblemCard({
  problem,
  selecting,
  selected,
  onToggle,
  onMasteryChange,
  layout = "card",
  hasHandle = false,
  sourceLabel,
}: {
  problem: Problem;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onMasteryChange?: (mastery: Mastery) => void;
  layout?: "card" | "row";
  hasHandle?: boolean;
  sourceLabel?: string;
}) {
  const browse = useProblemNavigationKey();
  const figure = problem.figures.find((f) => !f.inline && (f.image || f.svg));
  const body =
    layout === "row" ? (
      <>
        {figure?.image ? (
          <img
            src={figure.image}
            alt=""
            className="size-14 shrink-0 rounded-md bg-secondary object-contain"
          />
        ) : (
          <div className="grid size-14 shrink-0 place-items-center rounded-md bg-secondary text-[10px] text-muted-foreground">
            {SUBJECT_LABEL[problem.subject].slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display text-sm font-semibold text-fg group-hover:text-primary">
              {problem.title}
            </h3>
            {selecting || !onMasteryChange ? (
              <Badge variant={problem.mastery === "mastered" ? "mastered" : "outline"}>
                {MASTERY_LABEL[problem.mastery]}
              </Badge>
            ) : null}
          </div>
          <PracticeSummary problem={problem} />
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {problem.sourceOrder ? (
              <span>原题 {problem.sourceOrder}</span>
            ) : null}
            {tagsForDisplay(problem.tags, 2).map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </>
    ) : (
      <>
        {figure ? (
          <FigureFrame svg={figure.svg} image={figure.image} className="aspect-[5/4] border-b border-border/80" />
        ) : (
          <div className="flex h-32 min-w-0 items-start overflow-hidden border-b border-border/60 bg-surface px-4 py-4">
            <MathText
              text={problem.stem}
              compact
              className="w-full min-w-0 overflow-hidden line-clamp-5 text-sm text-fg"
            />
          </div>
        )}
        <div
          className={cn(
            "flex flex-1 flex-col gap-3 p-4",
            !selecting && onMasteryChange && "col-start-1 row-start-2",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <h3
              className={cn(
                "min-h-8 line-clamp-2 font-display text-base font-semibold leading-snug text-fg group-hover:text-primary",
                !selecting && onMasteryChange && "pr-20",
              )}
            >
              {problem.title}
            </h3>
            {selecting || !onMasteryChange ? (
              <Badge variant={problem.mastery === "mastered" ? "mastered" : "outline"}>
                {MASTERY_LABEL[problem.mastery]}
              </Badge>
            ) : null}
          </div>
          <PracticeSummary problem={problem} />
          {figure ? (
            <MathText text={problem.stem} compact className="line-clamp-2 text-sm text-muted-foreground" />
          ) : null}
          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            {sourceLabel ? <span className="w-full truncate text-xs text-muted-foreground" title={sourceLabel}>{sourceLabel}</span> : null}
            {problem.sourceOrder ? (
              <span className="text-xs text-muted-foreground">原题 {problem.sourceOrder}</span>
            ) : null}
            {tagsForDisplay(problem.tags, 2).map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </>
    );

  const frame = cn(
    "group relative w-full min-w-0 text-left shadow-[var(--shadow-border)]",
    "transition-[transform,box-shadow] duration-200 ease-out",
    layout === "row"
      ? "flex items-center gap-3 rounded-lg bg-card p-3"
      : "flex h-full flex-col overflow-hidden rounded-xl bg-card",
    !selecting && layout === "card" && "hover:-translate-y-0.5 hover:shadow-[var(--shadow-border-hover)]",
    !selecting && layout === "row" && "hover:bg-secondary/40",
    selecting && selected && "ring-2 ring-primary",
    selecting && layout === "row" && "pr-12",
    layout === "card" && (selecting || hasHandle) && "pt-10",
  );

  const mark = selecting ? (
    <span
      className={cn(
        "absolute z-10 grid size-6 place-items-center rounded-sm border border-border bg-surface/90",
        layout === "row" ? "right-3 top-1/2 -translate-y-1/2" : "left-3 top-3",
        selected && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {selected ? <Check className="size-3.5" /> : null}
    </span>
  ) : null;

  if (selecting) {
    return (
      <button type="button" aria-pressed={Boolean(selected)} onClick={onToggle} className={frame}>
        {mark}
        {body}
      </button>
    );
  }

  if (layout === "row" && onMasteryChange) {
    return (
      <div className={frame}>
        <Link
          to="/p/$id"
          params={{ id: problem.id }}
          search={{ browse }}
          className="flex min-w-0 flex-1 items-center gap-3 self-stretch"
        >
          {body}
        </Link>
        <MasteryMenu value={problem.mastery} onChange={onMasteryChange} />
      </div>
    );
  }

  if (layout === "card" && onMasteryChange) {
    return (
      <div className={cn(frame, "grid grid-rows-[auto_1fr]")}>
        <Link to="/p/$id" params={{ id: problem.id }} search={{ browse }} className="contents">
          {body}
        </Link>
        <div className="z-10 col-start-1 row-start-2 mr-4 mt-4 justify-self-end">
          <MasteryMenu value={problem.mastery} onChange={onMasteryChange} />
        </div>
      </div>
    );
  }

  return (
    <Link to="/p/$id" params={{ id: problem.id }} search={{ browse }} className={frame}>
      {body}
    </Link>
  );
}

function MasteryMenu({ value, onChange }: { value: Mastery; onChange: (mastery: Mastery) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`掌握程度：${MASTERY_LABEL[value]}`}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors",
            value === "mastered"
              ? "border-transparent bg-mastered/12 text-mastered hover:bg-mastered/20"
              : "border-border text-muted-foreground hover:bg-secondary hover:text-fg",
          )}
        >
          {MASTERY_LABEL[value]}
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-32">
        {MASTERY_VALUES.map((mastery) => (
          <DropdownMenuItem key={mastery} onSelect={() => onChange(mastery)}>
            <span className="grid size-4 place-items-center">
              {mastery === value ? <Check className="size-3.5" /> : null}
            </span>
            {MASTERY_LABEL[mastery]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
