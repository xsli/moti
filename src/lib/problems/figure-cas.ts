import { isDeepStrictEqual } from "node:util";

export function isFlatRedrawSvg(svg: string): boolean {
  return !/<!|<\?|\s(?:href|xlink:href|style|on\w+)\s*=|url\s*\(/i.test(svg)
    && ![...svg.matchAll(/<\/?([\w:-]+)/g)].some((m) => !["svg", "rect", "path", "ellipse", "text"].includes(m[1]));
}

// Build from the current database value, never a caller-supplied figures array.
export function replaceFigureMedia(
  current: Record<string, unknown>[], expected: Record<string, unknown>,
  image: string,
): Record<string, unknown>[] | null {
  const matches = current.filter((f) => f.id === expected.id);
  if (matches.length !== 1 || !isDeepStrictEqual(JSON.parse(JSON.stringify(matches[0])), JSON.parse(JSON.stringify(expected)))) return null;
  const original = matches[0].originalImage || matches[0].image;
  if (typeof original !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(original)) {
    throw new Error("缺少可保留的原始配图");
  }
  return current.map((f) => f.id === expected.id
    ? { ...f, image, originalImage: original, svg: "", redrawError: undefined } : f);
}
