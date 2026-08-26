import { GripVertical, Plus, Trash2 } from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { LayoutPick } from "@/components/paper/layout-pick";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chineseOrdinal, paperTotal, reorderRows, sectionCount, type PaperRow } from "@/lib/paper/layout";
import { applyLayoutToIds, idsFromRows } from "@/lib/paper/session";
import { usePaperStore } from "@/lib/paper/store";
import type { Problem } from "@/lib/problems/types";
import { cn } from "@/lib/utils";

const PRESETS = ["填空题", "选择题", "解答题"];

export function ArrangeList({
  rows,
  problems,
  onChange,
  onApplyMeta,
  onNext,
  onBack,
}: {
  rows: PaperRow[];
  problems: Problem[];
  onChange: (rows: PaperRow[]) => void;
  onApplyMeta?: (meta: { title: string; withAnswers: boolean }) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [layoutId, setLayoutId] = useState("");
  const templates = usePaperStore((s) => s.templates);
  const byId = new Map(problems.map((p) => [p.id, p]));
  const problemCount = rows.filter((row) => row.kind === "problem").length;
  const total = paperTotal(rows);

  function addHeading(title = "填空题") {
    onChange([{ kind: "heading", id: crypto.randomUUID(), title, perScore: 4 }, ...rows]);
  }

  function applyLayout() {
    const template = templates.find((item) => item.id === layoutId);
    if (!template) return;
    onChange(applyLayoutToIds(template.rows, idsFromRows(rows)));
    onApplyMeta?.({ title: template.title, withAnswers: template.withAnswers });
    toast.success(`已套用「${template.name}」，可继续改`);
  }

  function dropIndex(clientY: number) {
    const nodes = [...(listRef.current?.querySelectorAll("[data-row]") ?? [])];
    for (let i = 0; i < nodes.length; i += 1) {
      const box = nodes[i].getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return i;
    }
    return nodes.length;
  }

  function onGripPointerDown(event: PointerEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDraggingId(id);
    setOverIndex(rows.findIndex((row) => row.id === id));
  }

  function onGripPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingId) return;
    setOverIndex(dropIndex(event.clientY));
  }

  function onGripPointerUp() {
    if (draggingId && overIndex != null) {
      const from = rows.findIndex((row) => row.id === draggingId);
      onChange(reorderRows(rows, from, overIndex));
    }
    setDraggingId(null);
    setOverIndex(null);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">排版</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按住左侧横条拖动排序。总分 {total} 分。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onBack}>
            返回选题
          </Button>
          <Button onClick={onNext} disabled={!problemCount}>
            预览试卷
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((name) => (
          <Button key={name} type="button" size="sm" variant="outline" onClick={() => addHeading(name)}>
            <Plus className="size-4" />
            {name}
          </Button>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => addHeading("大题")}>
          <Plus className="size-4" />
          自定义标题
        </Button>
        {templates.length ? (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <LayoutPick value={layoutId} onChange={setLayoutId} />
            <Button type="button" size="sm" disabled={!layoutId} onClick={applyLayout}>
              套用
            </Button>
          </div>
        ) : null}
      </div>

      <ul ref={listRef} className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const problem = row.kind === "problem" ? byId.get(row.problemId) : null;
          const n = rows.slice(0, index + 1).filter((item) => item.kind === "problem").length;
          const headingNo = rows.slice(0, index + 1).filter((item) => item.kind === "heading").length;
          const isHeading = row.kind === "heading";
          const showLine = draggingId && overIndex === index;
          return (
            <li key={row.id} data-row={row.id} className="relative">
              {showLine ? <div className="absolute -top-1.5 left-2 right-2 z-10 h-0.5 rounded-full bg-primary" /> : null}
              <div
                className={cn(
                  "flex items-center gap-2",
                  draggingId === row.id && "opacity-50",
                  isHeading
                    ? "bg-primary text-primary-foreground"
                    : "rounded-xl bg-surface shadow-[var(--shadow-border)]",
                )}
                style={
                  isHeading
                    ? {
                        clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%)",
                        paddingRight: 28,
                      }
                    : undefined
                }
              >
                <button
                  type="button"
                  className={cn(
                    "grid h-11 w-8 shrink-0 touch-none place-items-center",
                    isHeading ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                  aria-label="拖动"
                  onPointerDown={(event) => onGripPointerDown(event, row.id)}
                  onPointerMove={onGripPointerMove}
                  onPointerUp={onGripPointerUp}
                  onPointerCancel={onGripPointerUp}
                >
                  <GripVertical className="size-4" />
                </button>
                {isHeading ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1">
                    <span className="shrink-0 font-display text-base font-semibold tracking-wide">
                      {chineseOrdinal(headingNo)}、
                    </span>
                    <Input
                      value={row.title}
                      onChange={(e) =>
                        onChange(
                          rows.map((item) =>
                            item.id === row.id && item.kind === "heading" ? { ...item, title: e.target.value } : item,
                          ),
                        )
                      }
                      className="h-9 min-w-0 flex-1 border-0 bg-transparent font-display text-base font-semibold tracking-wide text-primary-foreground shadow-none focus-visible:ring-0"
                      aria-label="一级标题"
                    />
                    <label className="flex shrink-0 items-center gap-1 text-xs">
                      每题
                      <Input
                        type="number"
                        min={0}
                        value={row.perScore ?? 0}
                        onChange={(e) =>
                          onChange(
                            rows.map((item) =>
                              item.id === row.id && item.kind === "heading"
                                ? { ...item, perScore: Math.max(0, Number(e.target.value) || 0) }
                                : item,
                            ),
                          )
                        }
                        className="h-8 w-14 border-primary-foreground/25 bg-primary-foreground/10 text-center text-primary-foreground shadow-none"
                        aria-label="每题分数"
                      />
                      分
                    </label>
                    <span className="shrink-0 text-xs opacity-80">
                      {sectionCount(rows, index)}题 / {sectionCount(rows, index) * (row.perScore || 0)}分
                    </span>
                  </div>
                ) : (
                  <p className="min-w-0 flex-1 truncate py-3 pr-3 text-sm">
                    <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                      {n}
                    </span>
                    {problem?.title || "题目"}
                  </p>
                )}
                {isHeading ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="mr-2 text-primary-foreground hover:bg-primary-foreground/15"
                    onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
                    aria-label="删除标题"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
        {draggingId && overIndex === rows.length ? (
          <li className="h-0.5 rounded-full bg-primary" />
        ) : null}
      </ul>
    </div>
  );
}
