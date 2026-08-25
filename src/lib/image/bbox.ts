export type ImageBBox = { x: number; y: number; w: number; h: number };

export function normalizeBBox(raw: unknown, minSize = 0.02): ImageBBox | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const box = raw as Record<string, unknown>;
  let x = Number(box.x ?? box.left);
  let y = Number(box.y ?? box.top);
  let w = Number(box.w ?? box.width);
  let h = Number(box.h ?? box.height);
  const x2 = Number(box.x2 ?? box.right);
  const y2 = Number(box.y2 ?? box.bottom);
  if (Number.isFinite(x2) && Number.isFinite(y2) && (!Number.isFinite(w) || !Number.isFinite(h))) {
    w = x2 - x;
    h = y2 - y;
  }
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return undefined;
  if (w <= 0 || h <= 0) return undefined;
  const looksPercent = x > 1 || y > 1 || w > 1 || h > 1;
  if (looksPercent && x <= 100 && y <= 100 && w <= 100 && h <= 100) {
    x /= 100;
    y /= 100;
    w /= 100;
    h /= 100;
  }
  x = Math.min(0.98, Math.max(0, x));
  y = Math.min(0.98, Math.max(0, y));
  w = Math.min(1 - x, Math.max(minSize, w));
  h = Math.min(1 - y, Math.max(minSize, h));
  if (w < minSize || h < minSize) return undefined;
  return { x, y, w, h };
}
