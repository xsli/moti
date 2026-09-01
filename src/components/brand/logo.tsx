import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="6.4" className="fill-surface stroke-fg" strokeWidth="1.2" />
      <path
        d="M7.5 24.5 L16 8.5 L24.5 24.5 Z"
        fill="none"
        className="stroke-fg"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="19.2" r="3.6" fill="#0d9f78" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className={cn("font-display text-xl font-semibold tracking-tight", compact && "sr-only sm:not-sr-only")}>
        解集
      </span>
    </span>
  );
}
