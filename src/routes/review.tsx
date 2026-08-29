import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { FigureFrame } from "@/components/notebook/figure-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MathText } from "@/lib/problems/math-text";
import { selectDueProblems, useProblemStore } from "@/lib/problems/store";
import { ERROR_REASON_LABEL, SUBJECT_LABEL } from "@/lib/problems/types";

export const Route = createFileRoute("/review")({ component: ReviewPage });

function ReviewPage() {
  const problems = useProblemStore((s) => s.problems);
  const status = useProblemStore((s) => s.status);
  const markReview = useProblemStore((s) => s.markReview);
  const [queue, setQueue] = useState<string[]>([]);
  const [inited, setInited] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (status === "ready" && !inited) {
      setQueue(selectDueProblems(problems).map((p) => p.id));
      setInited(true);
    }
  }, [status, inited, problems]);

  if (status !== "ready") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const current = problems.find((p) => p.id === queue[0]);
  const total = queue.length + done;

  function nextAfter(remembered: boolean) {
    if (!current) return;
    void markReview(current.id, remembered);
    setQueue((q) => q.slice(1));
    setDone((n) => n + 1);
    setRevealed(false);
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-lg rounded-xl bg-surface px-6 py-16 text-center shadow-[var(--shadow-border)]">
        <p className="font-display text-2xl font-semibold">
          {done > 0 ? "这轮复习完成了" : "这轮没有待复习的题"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {done > 0 ? `共过了 ${done} 道。` : "去拍一道新题，或打开本子随便翻一翻。"}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="outline">
            <Link to="/">回到本子</Link>
          </Button>
          <Button asChild>
            <Link to="/capture">拍题</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">复习</h1>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          {done + 1} / {total}
        </p>
      </div>

      <article className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap gap-2 px-5 pt-5">
          <Badge variant="accent">{SUBJECT_LABEL[current.subject]}</Badge>
          <Badge variant="outline">{ERROR_REASON_LABEL[current.errorReason]}</Badge>
        </div>
        <h2 className="px-5 pt-3 font-display text-xl font-semibold">{current.title}</h2>
        <div className="px-5 py-4">
          <MathText text={current.stem} />
        </div>
        {current.figures[0] ? (
          <FigureFrame svg={current.figures[0].svg} caption={current.figures[0].caption} />
        ) : null}

        {revealed ? (
          <div className="space-y-4 border-t border-border px-5 py-5">
            {current.myAnswer ? (
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">当时怎么错的</h3>
                <MathText text={current.myAnswer} className="mt-1 text-sm" />
              </section>
            ) : null}
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">正解</h3>
              <MathText text={current.correctAnswer || "（尚未填写）"} className="mt-1" />
            </section>
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">解析</h3>
              <MathText text={current.analysis || "（尚未填写）"} className="mt-1 text-sm" />
            </section>
          </div>
        ) : (
          <div className="border-t border-border px-5 py-6 text-center">
            <p className="text-sm text-muted-foreground">先在草稿纸上做完，再核对解析。</p>
            <Button className="mt-4" onClick={() => setRevealed(true)}>
              查看解析
            </Button>
          </div>
        )}
      </article>

      {revealed ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-12" onClick={() => nextAfter(false)}>
            <X className="size-4" />
            还是不会
          </Button>
          <Button className="h-12" onClick={() => nextAfter(true)}>
            <Check className="size-4" />
            记住了
          </Button>
        </div>
      ) : (
        <Button variant="ghost" className="self-center text-muted-foreground" asChild>
          <Link to="/p/$id" params={{ id: current.id }}>
            <RotateCcw className="size-4" />
            打开完整题目
          </Link>
        </Button>
      )}
    </div>
  );
}
