const DANGEROUS_TAGS =
  /<\/?(?:script|foreignObject|iframe|object|embed|link|meta|style)\b[^>]*>/gi;

export function extractSvg(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/<svg\b[\s\S]*?<\/svg>/i);
  return match ? match[0] : null;
}

export function sanitizeSvg(raw: string): string | null {
  const extracted = extractSvg(raw);
  if (!extracted) return null;

  let svg = extracted
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(DANGEROUS_TAGS, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "")
    .replace(/\shref\s*=\s*(['"])\s*(?!#)/gi, " data-href=$1")
    .replace(/\sxlink:href\s*=\s*(['"])(?!#)/gi, " data-xlink=$1");

  if (!/<svg\b/i.test(svg)) return null;
  if (!/\sxmlns=/.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  svg = svg
    .replace(/\swidth="[^"]*"/gi, "")
    .replace(/\sheight="[^"]*"/gi, "");

  if (!/\sviewBox=/i.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg viewBox="0 0 400 320"');
  }

  return svg;
}

export function svgToDownloadHref(svg: string): string {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  return URL.createObjectURL(blob);
}
