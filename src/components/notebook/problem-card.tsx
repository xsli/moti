import { Link } from "@tanstack/react-router";
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
import { formatLoggedDate } from "@/lib/problems/dates";
import { MASTERY_LABEL, SUBJECT_LABEL, type Mastery, type Problem } from "@/lib/problems/types";
import { cn } from "@/lib/utils";

export function ProblemCard({
  problem,
  selecting,
  selected,
  onToggle,
  onMasteryChange,
  layout = "card",
}: {
  problem: Problem;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onMasteryChange?: (mastery: Mastery) => void;
  layout?: "card" | "row";
}) {
  const figure = problem.figures.find((f) => f.image || f.svg);
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
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{formatLoggedDate(problem.createdAt)}</span>
            {problem.sourceOrder ? (
              <>
                <span>·</span>
                <span>原序 {problem.sourceOrder}</span>
              </>
            ) : null}
            <span>·</span>
            <span>{SUBJECT_LABEL[problem.subject]}</span>
            {problem.tags.slice(0, 2).map((tag) => (
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
          <div className="flex aspect-[5/4] min-w-0 items-center overflow-hidden bg-secondary/60 px-5">
            <MathText
              text={problem.stem}
              compact
              className="w-full min-w-0 overflow-hidden line-clamp-6 text-sm text-fg/80"
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
                "min-h-11 line-clamp-2 font-display text-base font-semibold leading-snug text-fg group-hover:text-primary",
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
          {figure ? (
            <MathText text={problem.stem} compact className="line-clamp-2 text-sm text-muted-foreground" />
          ) : null}
          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{formatLoggedDate(problem.createdAt)}</span>
            {problem.sourceOrder ? (
              <span className="text-xs text-muted-foreground">原序 {problem.sourceOrder}</span>
            ) : null}
            <Badge variant="accent">{SUBJECT_LABEL[problem.subject]}</Badge>
            {problem.tags.slice(0, 3).map((tag) => (
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
      ? "flex items-center gap-3 rounded-xl bg-card p-3"
      : "flex h-full flex-col overflow-hidden rounded-xl bg-card",
    !selecting && layout === "card" && "hover:-translate-y-0.5 hover:shadow-[var(--shadow-border-hover)]",
    !selecting && layout === "row" && "hover:bg-secondary/40",
    selecting && selected && "ring-2 ring-primary",
  );

  const mark = selecting ? (
    <span
      className={cn(
        "absolute z-10 grid size-6 place-items-center rounded-full border border-border bg-surface/90",
        layout === "row" ? "right-3 top-1/2 -translate-y-1/2" : "left-3 top-3",
        selected && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {selected ? <Check className="size-3.5" /> : null}
    </span>
  ) : null;

  if (selecting) {
    return (
      <button type="button" onClick={onToggle} className={frame}>
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
        <Link to="/p/$id" params={{ id: problem.id }} className="contents">
          {body}
        </Link>
        <div className="z-10 col-start-1 row-start-2 mr-4 mt-4 justify-self-end">
          <MasteryMenu value={problem.mastery} onChange={onMasteryChange} />
        </div>
      </div>
    );
  }

  return (
    <Link to="/p/$id" params={{ id: problem.id }} className={frame}>
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
        {(["new", "reviewing", "mastered"] as Mastery[]).map((mastery) => (
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
