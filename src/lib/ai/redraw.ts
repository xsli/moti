import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runCodexJson } from "@/lib/ai/codex";
import { sanitizeSvg } from "@/lib/problems/svg";

const REDRAW_PROMPT = `You are given a photograph of one Chinese math exam problem.

Find the printed mathematical diagram and redraw only that diagram as a clean textbook SVG.

Rules:
- Preserve geometry, proportions, labels, arrows, ticks, right-angle marks, axes, curves, and shading.
- Exclude the question text, answers, handwriting, QR codes, watermarks, page numbers, and other problems.
- Use a white background and dark print-sharp strokes.
- Crop tightly with a suitable viewBox.
- Use only ordinary SVG elements and attributes. Do not use scripts, external URLs, embedded images, style tags, or foreignObject.
- Return a complete <svg>...</svg> string in the svg field.`;

const REDRAW_OUTPUT_SCHEMA = {
  type: "object",
  properties: { svg: { type: "string" } },
  required: ["svg"],
  additionalProperties: false,
} as const;

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

export const redrawFigure = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ imageDataUrl: z.string().min(32).max(2_800_000) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; image: string } | { ok: false; error: string }> => {
    try {
      const result = await runCodexJson<{ svg: string }>({
        prompt: REDRAW_PROMPT,
        images: [data.imageDataUrl],
        outputSchema: REDRAW_OUTPUT_SCHEMA,
      });
      const svg = sanitizeSvg(result.svg);
      if (!svg) return { ok: false, error: "没有生成有效图形" };
      return { ok: true, image: svgDataUrl(svg) };
    } catch (error) {
      console.error("Codex redraw failed", error);
      return { ok: false, error: "图形重绘中断" };
    }
  });
