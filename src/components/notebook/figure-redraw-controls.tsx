import { useEffect, useRef, useState } from "react";
import { Image, LoaderCircle, RotateCcw, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FigureFrame } from "./figure-frame";
import { redrawDiagram } from "@/lib/image/figure";
import { originalFigureImage, restoreFigureOriginal, type FigureMedia } from "@/lib/problems/figure-media";

export function FigureRedrawControls<T extends FigureMedia & { title: string; subproblem?: number }>({
  figure, stem, onChange,
}: { figure: T; stem: string; onChange: (next: T) => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const latest = useRef({ figure, onChange });
  latest.current = { figure, onChange };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const original = originalFigureImage(figure);
  const canRedraw = /^data:image\/(?:png|jpeg|webp);base64,/.test(original ?? "");

  async function redraw() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await redrawDiagram(figure, stem);
      if (!mounted.current) return;
      if (latest.current.figure.image !== figure.image || latest.current.figure.originalImage !== figure.originalImage) {
        toast.message("配图已发生修改，本次重绘未覆盖新图");
        return;
      }
      await latest.current.onChange({ ...latest.current.figure, image: next.image, svg: next.svg,
        originalImage: next.originalImage, redrawError: next.redrawError });
      if (next.redrawError) toast.warning(next.redrawError);
      else toast.success("已采用重绘图，原图已保留");
    } catch {
      toast.error("配图保存失败，请重试");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return <div className="border-t border-border px-3 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-auto text-xs text-muted-foreground" role="status">
        {busy ? "正在重绘图形…" : figure.redrawError || (figure.originalImage ? "重绘图" : "原图")}
      </span>
      {canRedraw ? <Tooltip><TooltipTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="高清重绘" disabled={busy} onClick={() => void redraw()}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
        </Button>
      </TooltipTrigger><TooltipContent>高清重绘</TooltipContent></Tooltip> : null}
    </div>
    {figure.originalImage ? <details className="mt-1 text-sm">
      <summary className="cursor-pointer py-2 text-muted-foreground"><Image className="mr-2 inline size-4" />查看原图</summary>
      <FigureFrame svg="" image={figure.originalImage} caption="原始配图" />
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => {
        void Promise.resolve(onChange(restoreFigureOriginal(figure))).catch(() => toast.error("恢复原图失败"));
      }}><RotateCcw className="size-4" />使用原图</Button>
    </details> : null}
  </div>;
}
