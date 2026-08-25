import { useMemo } from "react";
import { sanitizeSvg } from "@/lib/problems/svg";
import { cn } from "@/lib/utils";

export function FigureFrame({
  svg,
  image,
  className,
  caption,
}: {
  svg: string;
  image?: string;
  className?: string;
  caption?: string;
}) {
  const clean = useMemo(() => (svg ? sanitizeSvg(svg) : null), [svg]);
  if (!clean && !image) {
    return (
      <div className={cn("flex items-center justify-center bg-secondary text-sm text-muted-foreground", className)}>
        图形无法显示
      </div>
    );
  }

  return (
    <figure className={cn("relative overflow-hidden bg-surface", className)}>
      <div className="drafting-grid pointer-events-none absolute inset-0 opacity-50" />
      {image ? (
        <img src={image} alt={caption || "题目图形"} className="relative max-h-[420px] w-full object-contain p-3 sm:p-4" />
      ) : (
        <div className="figure-frame relative p-3 sm:p-4" dangerouslySetInnerHTML={{ __html: clean ?? "" }} />
      )}
      {caption ? (
        <figcaption className="relative border-t border-border/70 px-3 py-2 text-center text-xs text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
