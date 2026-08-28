import { GripVertical } from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";
import { ProblemCard } from "@/components/notebook/problem-card";
import { moveId } from "@/lib/problems/order";
import type { Problem } from "@/lib/problems/types";
import { cn } from "@/lib/utils";

export function SortableProblems({
  problems,
  layout,
  selecting,
  selected,
  onToggle,
  onReorder,
}: {
  problems: Problem[];
  layout: "card" | "row";
  selecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onReorder?: (ids: string[]) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const sortable = Boolean(onReorder) && !selecting && problems.length > 1;

  function dropIndex(clientX: number, clientY: number) {
    const nodes = [...(listRef.current?.querySelectorAll("[data-row]") ?? [])];
    for (let i = 0; i < nodes.length; i += 1) {
      const box = nodes[i].getBoundingClientRect();
      if (layout === "row") {
        if (clientY < box.top + box.height / 2) return i;
      } else if (clientY < box.top || (clientY <= box.bottom && clientX < box.left + box.width / 2)) {
        return i;
      }
    }
    return nodes.length;
  }

  function onGripPointerDown(event: PointerEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
    setOverIndex(problems.findIndex((item) => item.id === id));
  }

  function onGripPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingId) return;
    setOverIndex(dropIndex(event.clientX, event.clientY));
  }

  function onGripPointerUp() {
    if (draggingId && overIndex != null && onReorder) {
      const from = problems.findIndex((item) => item.id === draggingId);
      onReorder(moveId(problems.map((item) => item.id), from, overIndex));
    }
    setDraggingId(null);
    setOverIndex(null);
  }

  const grid = layout === "card" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2";

  return (
    <div ref={listRef} className={grid}>
      {problems.map((problem, index) => (
        <div
          key={problem.id}
          data-row={problem.id}
          className={cn("relative", draggingId === problem.id && "opacity-60", sortable && layout === "row" && "pl-8")}
        >
          {sortable && overIndex === index ? (
            <span className="absolute -top-1 left-0 right-0 z-20 h-0.5 rounded-full bg-primary" />
          ) : null}
          {sortable ? (
            <button
              type="button"
              aria-label="拖动排序"
              className={cn(
                "absolute z-10 grid place-items-center text-muted-foreground hover:text-fg",
                layout === "row" ? "left-0 top-1/2 size-8 -translate-y-1/2" : "left-2 top-2 size-8 rounded-md bg-surface/80",
              )}
              onPointerDown={(e) => onGripPointerDown(e, problem.id)}
              onPointerMove={onGripPointerMove}
              onPointerUp={onGripPointerUp}
              onPointerCancel={onGripPointerUp}
              onClick={(e) => e.preventDefault()}
            >
              <GripVertical className="size-4" />
            </button>
          ) : null}
          <ProblemCard
            problem={problem}
            layout={layout}
            selecting={selecting}
            selected={selected.has(problem.id)}
            onToggle={() => onToggle(problem.id)}
          />
        </div>
      ))}
    </div>
  );
}
