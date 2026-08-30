import html2canvas from "html2canvas-pro";
import { PDFDocument } from "pdf-lib";
import type { Problem } from "@/lib/problems/types";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const A4_PX = 794;
const CSS_DPI = 96;
const PDF_DPI = 450;
const PDF_RENDER_SCALE = PDF_DPI / CSS_DPI;

async function waitImages(root: ParentNode) {
  const imgs = [...root.querySelectorAll("img")];
  await Promise.all(
    imgs.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
    ),
  );
  if (document.fonts?.ready) await document.fonts.ready;
  await new Promise((resolve) => window.setTimeout(resolve, 50));
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("无法生成页面图片"));
        return;
      }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
    }, "image/png");
  });
}

export async function buildExamPdf(
  _problems: Problem[],
  _options: { title: string; dateLabel: string; withAnswers: boolean },
): Promise<Blob> {
  const pages = [...document.querySelectorAll(".exam-page")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  if (!pages.length) throw new Error("请先打开试卷预览再生成 PDF");

  const pdf = await PDFDocument.create();
  for (const pageEl of pages) {
    await waitImages(pageEl);
    const shot = await html2canvas(pageEl, {
      backgroundColor: "#ffffff",
      scale: PDF_RENDER_SCALE,
      width: A4_PX,
      height: Math.round(A4_PX * (297 / 210)),
      windowWidth: A4_PX,
      windowHeight: Math.round(A4_PX * (297 / 210)),
      logging: false,
      useCORS: true,
      foreignObjectRendering: false,
    });
    const png = await canvasPng(shot);
    const image = await pdf.embedPng(png);
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    page.drawImage(image, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    shot.width = 1;
    shot.height = 1;
  }

  const bytes = await pdf.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "application/pdf" });
}
