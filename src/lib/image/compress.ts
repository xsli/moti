import type { ImageBBox } from "./bbox";

export type { ImageBBox } from "./bbox";
export { normalizeBBox } from "./bbox";

export function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && file.type !== "") {
    return Promise.reject(new Error("请选择图片文件"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
}

export async function dataUrlForGrok(dataUrl: string): Promise<string> {
  const bitmap = await bitmapFromDataUrl(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return dataUrl;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = canvas.toDataURL("image/jpeg", 0.92);
  return jpeg.length && jpeg.length < dataUrl.length ? jpeg : dataUrl;
}

async function bitmapFromDataUrl(dataUrl: string): Promise<ImageBitmap> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

export type CropPad = number | { x?: number; y?: number; bottom?: number };

function resolvePad(pad: CropPad): { left: number; right: number; top: number; bottom: number } {
  if (typeof pad === "number") {
    return { left: pad, right: pad, top: pad, bottom: pad };
  }
  const x = pad.x ?? 0.04;
  const y = pad.y ?? 0.04;
  return { left: x, right: x, top: y, bottom: pad.bottom ?? y };
}

export async function cropDataUrl(
  dataUrl: string,
  bbox: ImageBBox,
  pad: CropPad = 0.02,
): Promise<string> {
  const bitmap = await bitmapFromDataUrl(dataUrl);
  const p = resolvePad(pad);
  const x = Math.max(0, bbox.x - p.left) * bitmap.width;
  const y = Math.max(0, bbox.y - p.top) * bitmap.height;
  const w = Math.min(bitmap.width - x, (bbox.w + p.left + p.right) * bitmap.width);
  const h = Math.min(bitmap.height - y, (bbox.h + p.top + p.bottom) * bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("无法裁切图片");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, x, y, w, h, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const png = canvas.toDataURL("image/png");
  if (png.length <= 12_000_000) return png;
  return canvas.toDataURL("image/jpeg", 0.95);
}
