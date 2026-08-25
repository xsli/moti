import { authMiddleware } from "@/lib/auth/middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const REDRAW_PROMPT = `You are given a photograph of ONE Chinese math exam problem. It may include printed text, an answer, a watermark, or a QR code.

Your job:
1. Find the printed mathematical diagram (geometry figure, function graph, or chart).
2. Redraw ONLY that diagram as a clean textbook illustration.

Rules:
- Keep the same geometry, proportions, vertex labels, arrows, ticks, right-angle marks, and shading.
- Keep original line colors.
- Do NOT copy Chinese stem text, answers like 【答案】, QR codes, watermarks, page numbers, or extra problems.
- White background, print-sharp, no decoration.
- Crop tightly around the diagram plus its labels. The output image should be the figure itself, not the whole worksheet.`;

function asDataUrl(bytes: ArrayBuffer, mime = "image/jpeg"): string {
  const b64 = Buffer.from(bytes).toString("base64");
  return `data:${mime};base64,${b64}`;
}

async function urlToDataUrl(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 80) return null;
  const dataUrl = asDataUrl(buf, mime.includes("png") ? "image/png" : "image/jpeg");
  return dataUrl;
}

function parseImagePayload(payload: unknown): string | null {
  const obj = (payload ?? {}) as Record<string, unknown>;
  const data = Array.isArray(obj.data) ? obj.data[0] : obj;
  const rec = (data ?? {}) as Record<string, unknown>;
  const b64 = String(rec.b64_json ?? rec.base64 ?? rec.b64 ?? "");
  if (b64) {
    const raw = b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`;
    return raw;
  }
  const url = String(rec.url ?? obj.url ?? "");
  return url || null;
}

export const redrawFigure = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ imageDataUrl: z.string().min(32).max(2_800_000) }).parse(input),
  )
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<{ ok: true; image: string } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "当前环境暂未开通重绘。" };

    try {
      const res = await fetch("https://api.x.ai/v1/images/edits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-imagine-image-2.0",
          prompt: REDRAW_PROMPT,
          image: { url: data.imageDataUrl, type: "image_url" },
          size: "2K",
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("imagine redraw error", res.status, errText.slice(0, 500));
        return { ok: false, error: "图形重绘失败" };
      }
      const payload = (await res.json()) as unknown;
      const parsed = parseImagePayload(payload);
      if (!parsed) return { ok: false, error: "没有返回图形" };
      if (parsed.startsWith("data:")) return { ok: true, image: parsed };
      const downloaded = await urlToDataUrl(parsed);
      if (!downloaded) return { ok: false, error: "图形下载失败" };
      return { ok: true, image: downloaded };
    } catch (error) {
      console.error("imagine redraw failed", error);
      return { ok: false, error: "图形重绘中断" };
    }
  });
