import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export const MAX_PDF_SIZE_BYTES = 80 * 1024 * 1024;

type RenderPdfOptions = {
  maxPages: number;
  onProgress?: (current: number, total: number) => void;
};

export type RenderedPdf = {
  images: string[];
  pageCount: number;
  truncated: boolean;
};

export async function renderPdfPages(file: File, options: RenderPdfOptions): Promise<RenderedPdf> {
  if (file.size > MAX_PDF_SIZE_BYTES) {
    throw new Error("PDF 文件不能超过 80 MB。");
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data: bytes });
  const pdfDocument = await task.promise;
  const pageCount = pdfDocument.numPages;
  const total = Math.min(pageCount, options.maxPages);
  const images: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      options.onProgress?.(pageNumber, total);
      const page = await pdfDocument.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3.5, 2200 / Math.max(1, base.width));
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("浏览器无法创建 PDF 页面图像。");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg", 0.94));
      page.cleanup();
    }
  } finally {
    await pdfDocument.destroy();
  }

  return {
    images,
    pageCount,
    truncated: pageCount > total,
  };
}
