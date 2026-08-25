import type { ImageBBox } from "./bbox";

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("无法读取图片"));
    img.src = dataUrl;
  });
}

function clampBox(x: number, y: number, w: number, h: number): ImageBBox {
  x = Math.min(0.92, Math.max(0, x));
  y = Math.min(0.92, Math.max(0, y));
  w = Math.min(1 - x, Math.max(0.1, w));
  h = Math.min(1 - y, Math.max(0.1, h));
  return { x, y, w, h };
}

export async function detectFigureBox(dataUrl: string): Promise<ImageBBox | undefined> {
  const img = await loadImage(dataUrl);
  const maxEdge = 320;
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const width = Math.max(32, Math.round(img.width * scale));
  const height = Math.max(32, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) {
    const o = i * 4;
    const luma = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    ink[i] = luma < 168 ? 1 : 0;
  }

  const cols = 16;
  const rows = 16;
  const cellW = width / cols;
  const cellH = height / rows;
  const score = new Float32Array(cols * rows);

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor(gx * cellW);
      const y0 = Math.floor(gy * cellH);
      const x1 = Math.floor((gx + 1) * cellW);
      const y1 = Math.floor((gy + 1) * cellH);
      let dark = 0;
      let grad = 0;
      let transitions = 0;
      let pixels = 0;
      for (let y = y0; y < y1; y++) {
        let prev = 0;
        for (let x = x0; x < x1; x++) {
          const i = y * width + x;
          const v = ink[i];
          dark += v;
          if (v !== prev) transitions += 1;
          prev = v;
          if (x + 1 < width) grad += Math.abs(ink[i] - ink[i + 1]);
          if (y + 1 < height) grad += Math.abs(v - ink[i + width]);
          pixels += 1;
        }
      }
      const inkRatio = dark / Math.max(1, pixels);
      const textiness = transitions / Math.max(1, pixels);
      const edges = grad / Math.max(1, pixels);
      const qrLike = inkRatio > 0.38 && gx >= cols * 0.55 && gy >= rows * 0.55;
      if (qrLike || inkRatio < 0.02 || textiness > 0.22) {
        score[gy * cols + gx] = 0;
        continue;
      }
      const inBand = inkRatio > 0.02 && inkRatio < 0.36 ? 1 : 0;
      score[gy * cols + gx] = inBand * (edges * 3 - textiness * 2.2);
    }
  }

  let best = 0;
  let seed = -1;
  for (let i = 0; i < score.length; i++) {
    if (score[i] > best) {
      best = score[i];
      seed = i;
    }
  }
  if (seed < 0 || best <= 0.004) return undefined;

  const seen = new Uint8Array(score.length);
  const stack = [seed];
  seen[seed] = 1;
  let minX = cols;
  let minY = rows;
  let maxX = -1;
  let maxY = -1;
  const thresh = best * 0.38;
  while (stack.length) {
    const i = stack.pop() as number;
    if (score[i] < thresh) continue;
    const gx = i % cols;
    const gy = Math.floor(i / cols);
    minX = Math.min(minX, gx);
    minY = Math.min(minY, gy);
    maxX = Math.max(maxX, gx);
    maxY = Math.max(maxY, gy);
    const neighbors = [i - 1, i + 1, i - cols, i + cols];
    for (const n of neighbors) {
      if (n < 0 || n >= score.length || seen[n]) continue;
      const nx = n % cols;
      if (Math.abs(nx - gx) > 1) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  if (maxX < minX) return undefined;

  const pad = 0.45;
  const box = clampBox(
    (minX - pad) / cols,
    (minY - pad) / rows,
    (maxX - minX + 1 + pad * 2) / cols,
    (maxY - minY + 1 + pad * 2) / rows,
  );
  if (box.w * box.h > 0.55) return undefined;
  return box;
}
