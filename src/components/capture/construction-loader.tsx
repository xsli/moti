import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r} 秒`;
  return `${m} 分 ${String(r).padStart(2, "0")} 秒`;
}

export function ConstructionLoader({
  phase,
  current,
  total,
  startedAt,
  withAnswer,
  onCancel,
}: {
  phase: "upload" | "recognize";
  current: number;
  total: number;
  startedAt: number;
  withAnswer?: boolean;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [stageAt, setStageAt] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setStageAt(Date.now());
  }, [phase, current]);

  const elapsed = Math.max(0, now - startedAt);
  const stageElapsed = Math.max(0, now - stageAt);
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.min(Math.max(1, current), safeTotal);
  const ratio = Math.min(0.95, Math.max(0.06, (safeCurrent - 0.45) / safeTotal));
  const title =
    phase === "upload"
      ? "正在上传照片"
      : withAnswer
        ? "正在识别并生成答案"
        : "正在识别题干";

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <div className="relative size-[180px] sm:size-[220px]">
        <svg viewBox="0 0 200 200" className="size-full" aria-hidden="true">
          <circle cx="100" cy="108" r="72" fill="none" className="stroke-rule" strokeWidth="1" />
          <g className="origin-center" style={{ transformOrigin: "100px 108px" }}>
            <path
              d="M100 36 L162.4 144 H37.6 Z"
              fill="none"
              stroke="currentColor"
              className="text-ink draw-path"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <circle
              cx="100"
              cy="108"
              r="36"
              fill="none"
              className="stroke-primary draw-circle"
              strokeWidth="1.6"
            />
          </g>
          <circle cx="100" cy="36" r="2.4" className="fill-fg" />
          <circle cx="162.4" cy="144" r="2.4" className="fill-fg" />
          <circle cx="37.6" cy="144" r="2.4" className="fill-fg" />
        </svg>
      </div>
      <div className="w-full max-w-sm text-center">
        <p className="font-display text-lg font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {safeTotal > 1 ? `第 ${safeCurrent} / ${safeTotal} 张` : "处理这一张"}
          {phase === "recognize" ? ` · 本张 ${formatElapsed(stageElapsed)}` : null}
        </p>
        <p className="mt-3 font-display text-2xl tabular-nums tracking-tight">{formatElapsed(elapsed)}</p>
        <p className="mt-1 text-xs text-muted-foreground">已用时间，可随时取消</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
        {safeTotal > 1 ? (
          <ol className="mt-4 space-y-1.5 text-left text-sm">
            {phase === "upload"
              ? null
              : Array.from({ length: safeTotal }, (_, i) => {
                  const n = i + 1;
                  const done = n < safeCurrent;
                  const active = n === safeCurrent;
                  return (
                    <li
                      key={n}
                      className={
                        active
                          ? "text-fg"
                          : done
                            ? "text-muted-foreground"
                            : "text-muted-foreground/50"
                      }
                    >
                      {done ? "完成" : active ? "进行中" : "等待"} · 第 {n} 张
                      {active ? ` · ${formatElapsed(stageElapsed)}` : null}
                    </li>
                  );
                })}
            {phase === "upload"
              ? Array.from({ length: safeTotal }, (_, i) => {
                  const n = i + 1;
                  const done = n < safeCurrent;
                  const active = n === safeCurrent;
                  return (
                    <li
                      key={n}
                      className={
                        active
                          ? "text-fg"
                          : done
                            ? "text-muted-foreground"
                            : "text-muted-foreground/50"
                      }
                    >
                      {done ? "完成" : active ? "进行中" : "等待"} · 上传第 {n} 张
                    </li>
                  );
                })
              : null}
          </ol>
        ) : null}
      </div>
      <Button type="button" variant="outline" onClick={onCancel}>
        取消识别
      </Button>
      <style>{`
        .draw-path {
          stroke-dasharray: 420;
          stroke-dashoffset: 420;
          animation: draw-stroke 2.4s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        .draw-circle {
          stroke-dasharray: 230;
          stroke-dashoffset: 230;
          animation: draw-stroke 2.4s 0.35s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        @keyframes draw-stroke {
          0% { stroke-dashoffset: 420; opacity: 0.4; }
          35% { opacity: 1; }
          70% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0.2; }
        }
        @media (prefers-reduced-motion: reduce) {
          .draw-path, .draw-circle { animation: none; stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}
