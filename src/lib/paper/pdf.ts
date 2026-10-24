import html2canvas from "html2canvas-pro";
import { PDFDocument } from "pdf-lib";
import type { Problem } from "@/lib/problems/types";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const A4_PX = 794;
const CSS_DPI = 96;
const PDF_DPI = 450;
const PDF_RENDER_SCALE = PDF_DPI / CSS_DPI;

async function prepareMathDelimiters(document: Document, page: HTMLElement, scale: number) {
  // Snapshot KaTeX's SVG pieces in the export clone. Canvas capture otherwise
  // clips/repositions these absolutely positioned, em-sized delimiter strips.
  for (const svg of page.querySelectorAll<SVGSVGElement>(".katex .delimsizing.mult svg")) {
    const { width, height } = svg.getBoundingClientRect();
    if (!width || !height) continue;
    const color = svg.ownerDocument.defaultView!.getComputedStyle(svg).color;
    const standalone = svg.cloneNode(true) as SVGSVGElement;
    standalone.removeAttribute("style");
    standalone.setAttribute("width", `${width}px`);
    standalone.setAttribute("height", `${height}px`);
    standalone.setAttribute("fill", color);
    standalone.setAttribute("stroke", "none");
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(standalone))}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    canvas.style.cssText = `position:absolute;display:block;width:${width}px;height:${height}px;`;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法绘制公式括号，请重试导出");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    svg.replaceWith(canvas);
  }
}

async function waitImages(root: ParentNode) {
  const imgs = [...root.querySelectorAll("img")];
  await Promise.all(
    imgs.map((img) =>
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
      blob
        .arrayBuffer()
        .then((buf) => resolve(new Uint8Array(buf)))
        .catch(reject);
    }, "image/png");
  });
}

export async function appendBookPdfPage(
  pdf: PDFDocument,
  pageEl: HTMLElement,
  options: { signal: AbortSignal; index?: number; dpi: number },
): Promise<void> {
  options.signal.throwIfAborted();
  await waitImages(pageEl);
  options.signal.throwIfAborted();
  if ([...pageEl.querySelectorAll("img")].some((img) => !img.naturalWidth)) {
    throw new Error("配图加载失败，已停止导出");
  }
  const shot = await html2canvas(pageEl, {
    backgroundColor: "#ffffff",
    scale: options.dpi / CSS_DPI,
    width: A4_PX,
    height: Math.round(A4_PX * (297 / 210)),
    windowWidth: A4_PX,
    windowHeight: Math.round(A4_PX * (297 / 210)),
    logging: false,
    useCORS: true,
    foreignObjectRendering: false,
    onclone: (document, page) => prepareMathDelimiters(document, page, options.dpi / CSS_DPI),
  });
  try {
    options.signal.throwIfAborted();
    const blob = await new Promise<Blob>((resolve, reject) =>
      shot.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("无法生成页面图片"))),
        "image/jpeg",
        0.94,
      ),
    );
    const image = await pdf.embedJpg(await blob.arrayBuffer());
    const page =
      options.index === undefined
        ? pdf.addPage([PAGE_W, PAGE_H])
        : pdf.insertPage(options.index, [PAGE_W, PAGE_H]);
    page.drawImage(image, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  } finally {
    shot.width = 1;
    shot.height = 1;
  }
}

export async function buildExamPdf(
  _problems: Problem[],
  _options: { title: string; dateLabel: string; withAnswers: boolean },
): Promise<Blob> {
  const sheets = [...document.querySelectorAll<HTMLElement>(".exam-sheet")].filter(
    (sheet) => !sheet.closest("[data-pdf-snapshot]") && sheet.querySelector(":scope > .exam-pack > .exam-page"),
  );
  if (!sheets.length) throw new Error("请先打开试卷预览再生成 PDF");

  // Freeze before the first await: repagination can replace every live page.
  // Keep the sheet wrapper and its styles so the snapshot survives navigation too.
  const snapshot = document.createElement("div");
  snapshot.dataset.pdfSnapshot = "";
  snapshot.setAttribute("aria-hidden", "true");
  snapshot.inert = true;
  snapshot.style.cssText = `position:fixed;left:-12000px;top:0;width:${A4_PX}px;pointer-events:none;`;
  for (const sheet of sheets) {
    const clone = sheet.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".exam-measure").forEach((node) => node.remove());
    snapshot.append(clone);
  }
  document.body.append(snapshot);

  try {
    const pages = snapshot.querySelectorAll<HTMLElement>(".exam-pack > .exam-page");
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
        onclone: (document, page) => prepareMathDelimiters(document, page, PDF_RENDER_SCALE),
      });
      try {
        const png = await canvasPng(shot);
        const image = await pdf.embedPng(png);
        const page = pdf.addPage([PAGE_W, PAGE_H]);
        page.drawImage(image, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
      } finally {
        shot.width = 1;
        shot.height = 1;
      }
    }

    const bytes = await pdf.save();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new Blob([copy], { type: "application/pdf" });
  } finally {
    snapshot.remove();
  }
}
