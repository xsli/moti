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
}: {
  problem: Problem;
  selecting?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const figure = problem.figures.find((f) => f.image || f.svg);
  const body = (
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
    "group relative flex flex-col overflow-hidden rounded-xl bg-card text-left shadow-[var(--shadow-border)]",
    "transition-[transform,box-shadow] duration-200 ease-out",
    !selecting && "hover:-translate-y-0.5 hover:shadow-[var(--shadow-border-hover)]",
    selecting && selected && "ring-2 ring-primary",
  );

  const mark = selecting ? (
    <span
      className={cn(
        "absolute left-3 top-3 z-10 grid size-6 place-items-center rounded-full border border-border bg-surface/90",
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
