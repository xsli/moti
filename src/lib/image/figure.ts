import { redrawFigure } from "@/lib/ai/redraw";
import { applyFigureRedraw, originalFigureImage, type FigureMedia } from "@/lib/problems/figure-media";
import { abortable } from "./abortable";

export async function redrawDiagram<T extends FigureMedia & { title: string; subproblem?: number }>(figure: T, stem: string, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const imageDataUrl = originalFigureImage(figure);
  if (!imageDataUrl) return figure;
  try {
    const drawn = await abortable(redrawFigure({ data: { imageDataUrl, stem, title: figure.title, subproblem: figure.subproblem } }), signal);
    if (!drawn.ok) return { ...figure, redrawError: drawn.error };
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => image.naturalWidth > 0 ? resolve() : reject(new Error("empty image"));
      image.onerror = reject;
      image.src = drawn.image;
    });
    return applyFigureRedraw(figure, drawn.image);
  } catch {
    signal?.throwIfAborted();
    return { ...figure, redrawError: "重绘未完成，已保留原图，可稍后重试" };
  }
}
