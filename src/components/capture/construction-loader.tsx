import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STEPS = ["正在看清题干", "把多道题拆开", "整理解析"];

function formatRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function ConstructionLoader({
  stepIndex,
  timeoutMs,
  onCancel,
}: {
  stepIndex: number;
  timeoutMs: number;
  onCancel: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started), 200);
    return () => window.clearInterval(id);
  }, []);

  const ratio = Math.min(1, elapsed / timeoutMs);
  const remain = Math.max(0, timeoutMs - elapsed);
  const label = STEPS[stepIndex % STEPS.length];

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <div className="relative size-[220px] sm:size-[260px]">
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
        <p className="font-display text-lg font-semibold">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">最长等 3 分钟。可以随时取消，照片不会丢。</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs tabular-nums text-muted-foreground">剩余 {formatRemain(remain)}</p>
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
