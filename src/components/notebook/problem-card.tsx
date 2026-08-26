import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FigureFrame } from "@/components/notebook/figure-frame";
import { MathText } from "@/lib/problems/math-text";
import { formatLoggedDate } from "@/lib/problems/dates";
import { MASTERY_LABEL, SUBJECT_LABEL, type Problem } from "@/lib/problems/types";
import { cn } from "@/lib/utils";

export function ProblemCard({
  problem,
  selecting,
  selected,
  onToggle,
  layout = "card",
}: {
  problem: Problem;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
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
            <Badge variant={problem.mastery === "mastered" ? "mastered" : "outline"}>
              {MASTERY_LABEL[problem.mastery]}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{formatLoggedDate(problem.createdAt)}</span>
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
          <div className="flex aspect-[5/4] items-center bg-secondary/60 px-5">
            <MathText text={problem.stem} className="line-clamp-6 text-sm text-fg/80" />
          </div>
        )}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-base font-semibold leading-snug text-fg group-hover:text-primary">
              {problem.title}
            </h3>
            <Badge variant={problem.mastery === "mastered" ? "mastered" : "outline"}>
              {MASTERY_LABEL[problem.mastery]}
            </Badge>
          </div>
          {figure ? (
            <MathText text={problem.stem} className="line-clamp-2 text-sm text-muted-foreground" />
          ) : null}
          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{formatLoggedDate(problem.createdAt)}</span>
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
    "group relative text-left shadow-[var(--shadow-border)]",
    "transition-[transform,box-shadow] duration-200 ease-out",
    layout === "row"
      ? "flex items-center gap-3 rounded-xl bg-card p-3"
      : "flex flex-col overflow-hidden rounded-xl bg-card",
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

  return (
    <Link to="/p/$id" params={{ id: problem.id }} className={frame}>
      {body}
    </Link>
  );
}
