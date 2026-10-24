import type { ExamItem } from "./layout";
import { buildGaokaoLatex, type GaokaoLatexOptions } from "./gaokao-latex";
import { pictureBytes } from "./gaokao-latex-bundle";
import type { GaokaoPdfRequest } from "./gaokao-pdf-schema";
import { compileGaokaoPdf } from "./gaokao-pdf";

type Preview = { blob: Blob; warnings: string[] };
const previews = new Map<string, Promise<Preview>>();

export async function getGaokaoPdf(items: ExamItem[], options: GaokaoLatexOptions): Promise<Preview> {
  const data = await prepareGaokaoPdf(items, options);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)));
  const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const cached = previews.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const result = await compileGaokaoPdf({ data });
    if (!result.ok) throw new Error(result.error);
    const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
    return { blob: new Blob([bytes], { type: "application/pdf" }), warnings: result.warnings };
  })();
  previews.set(key, pending);
  while (previews.size > 4) previews.delete(previews.keys().next().value!);
  try { return await pending; }
  catch (error) { if (previews.get(key) === pending) previews.delete(key); throw error; }
}

export async function prepareGaokaoPdf(items: ExamItem[], options: GaokaoLatexOptions): Promise<GaokaoPdfRequest> {
  const source = buildGaokaoLatex(items, options);
  const images = new Map<object, string>();
  for (const asset of source.assets) {
    if (/^data:image\/(?:png|jpeg);base64,/.test(asset.figure.image ?? "")) {
      images.set(asset.figure, asset.figure.image!);
      continue;
    }
    const bytes = await pictureBytes(asset.figure);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    images.set(asset.figure, `data:image/${asset.path.endsWith(".jpg") ? "jpeg" : "png"};base64,${btoa(binary)}`);
  }
  return {
    options: { ...options, minutes: options.minutes ?? 120, solutionSpaceCm: options.solutionSpaceCm ?? 5 },
    items: items.map(item => item.kind === "heading" ? item : ({
      kind: "problem", role: item.role, points: item.points,
      problem: {
        id: item.problem.id, title: item.problem.title, stem: item.problem.stem,
        correctAnswer: options.withAnswers ? item.problem.correctAnswer : "",
        analysis: options.withAnswers ? item.problem.analysis : "",
        notes: item.problem.notes, tags: item.problem.tags,
        figures: item.problem.figures.filter(f => images.has(f)).map(f => ({ id: f.id, inline: f.inline, image: images.get(f)! })),
      },
    })),
  };
}
