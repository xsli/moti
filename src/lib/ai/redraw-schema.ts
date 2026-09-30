import { z } from "zod";

const color = z.string().regex(/^(?:none|white|black|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})$/);
const coordinate = z.number().finite().min(-4000).max(4000);
const elementSchema = z.object({
  kind: z.enum(["path", "ellipse", "text"]),
  d: z.string().max(16000).regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]*$/),
  x: coordinate, y: coordinate,
  rx: z.number().min(0).max(2000), ry: z.number().min(0).max(2000),
  text: z.string().max(120),
  fontSize: z.number().min(10).max(64), italic: z.boolean(),
  fill: color, stroke: color,
  strokeWidth: z.number().min(0).max(6),
  dash: z.string().max(50).regex(/^[0-9.,\s]*$/),
});
export const redrawSceneSchema = z.object({
  approved: z.boolean(), reason: z.string().max(300),
  width: z.number().min(100).max(2000), height: z.number().min(100).max(2000),
  elements: z.array(elementSchema).max(250),
});
export const REDRAW_OUTPUT_SCHEMA = z.toJSONSchema(redrawSceneSchema);
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

// Only these primitives are emitted; model output is never executed or inserted as raw SVG.
export function renderRedrawScene(raw: unknown): { svg: string; reason: string } {
  const scene = redrawSceneSchema.parse(raw);
  if (!scene.approved) return { svg: "", reason: scene.reason || "图形关系无法确认，保留原图" };
  const hasGeometry = scene.elements.some((e) => (e.kind === "path" && /[LlHhVvCcSsQqTtAa]/.test(e.d))
    || (e.kind === "ellipse" && e.rx > 0 && e.ry > 0));
  // Some source diagrams consist only of positioned labels (for example, a counting circle).
  const labelPositions = new Set(scene.elements.filter((e) => e.kind === "text"
    && e.text.trim() && e.fill !== "white" && !/^#(?:fff|ffffff)$/i.test(e.fill))
    .map((e) => `${e.x},${e.y}`));
  if (!hasGeometry && labelPositions.size < 2) throw new Error("重绘结果没有图形");
  const body = scene.elements.map((e) => {
    const appearance = `fill="${e.fill}" stroke="${e.stroke}" stroke-width="${e.strokeWidth}" stroke-dasharray="${e.dash || "none"}" stroke-linecap="round" stroke-linejoin="round"`;
    if (e.kind === "path") return `<path d="${e.d}" ${appearance}/>`;
    if (e.kind === "ellipse") {
      if (e.x-e.rx<0 || e.y-e.ry<0 || e.x+e.rx>scene.width || e.y+e.ry>scene.height) throw new Error("重绘圆弧超出画布");
      return `<ellipse cx="${e.x}" cy="${e.y}" rx="${e.rx}" ry="${e.ry}" ${appearance}/>`;
    }
    if (e.x<0 || e.y<e.fontSize || e.x>scene.width || e.y>scene.height) throw new Error("重绘标注超出画布");
    return `<text x="${e.x}" y="${e.y}" font-family="Times New Roman, serif" font-size="${e.fontSize}" font-style="${e.italic ? "italic" : "normal"}" text-anchor="middle" fill="${e.fill === "none" ? "black" : e.fill}">${escapeXml(e.text)}</text>`;
  }).join("");
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}"><rect width="100%" height="100%" fill="white"/>${body}</svg>`, reason: "" };
}
