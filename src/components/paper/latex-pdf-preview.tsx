import { useEffect, useRef } from "react";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PdfCMapReader } from "@/lib/paper/pdf-cmaps";

// Render the actual downloadable PDF, not a second HTML approximation.
export function LatexPdfPreview({ blob, onError }: { blob: Blob; onError: (message: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let task: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
    let observer: IntersectionObserver | undefined;
    let renderTask: import("pdfjs-dist").RenderTask | undefined;
    const host = container.current!;
    host.replaceChildren();
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      const data = new Uint8Array(await blob.arrayBuffer());
      if (disposed) return;
      task = pdfjs.getDocument({ data, CMapReaderFactory: PdfCMapReader });
      const document = await task.promise;
      if (disposed) return;
      const first = await document.getPage(1);
      if (disposed) return;
      const size = first.getViewport({ scale: 1 });
      const slots: HTMLDivElement[] = [];
      const pending = new Set<number>();
      const rendered = new Set<number>();
      let running = false;
      for (let number = 1; number <= document.numPages; number++) {
        const slot = window.document.createElement("div");
        slot.className = "mx-auto w-full max-w-[794px] bg-white shadow-sm";
        slot.style.aspectRatio = `${size.width} / ${size.height}`;
        slot.dataset.pdfPage = String(number);
        slot.setAttribute("aria-busy", "true");
        slots.push(slot);
        host.appendChild(slot);
      }
      async function drain() {
        if (running || disposed) return;
        running = true;
        try {
          while (pending.size && !disposed) {
            const number = [...pending].sort((a, b) => Math.abs(slots[a - 1].getBoundingClientRect().top) - Math.abs(slots[b - 1].getBoundingClientRect().top))[0];
            pending.delete(number);
            if (rendered.has(number)) continue;
            const page = number === 1 ? first : await document.getPage(number);
            if (disposed) return;
            const scale = Math.min(1.8, Math.max(1.3, host.clientWidth * window.devicePixelRatio / size.width));
            const viewport = page.getViewport({ scale });
            const canvas = window.document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            canvas.className = "block h-auto w-full";
            canvas.setAttribute("role", "img");
            canvas.setAttribute("aria-label", `试卷第 ${number} 页，共 ${document.numPages} 页`);
            renderTask = page.render({ canvasContext: canvas.getContext("2d")!, canvas, viewport });
            await renderTask.promise;
            if (disposed) return;
            slots[number - 1].replaceChildren(canvas);
            slots[number - 1].setAttribute("aria-busy", "false");
            rendered.add(number);
            observer?.unobserve(slots[number - 1]);
            page.cleanup();
          }
        } finally { running = false; }
      }
      const fail = (error: unknown) => { if (!disposed) onError(error instanceof Error ? error.message : "PDF 预览失败"); };
      // Keep page positions stable, but rasterize only the first/nearby pages.
      pending.add(1);
      await drain();
      if (disposed) return;
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) pending.add(Number((entry.target as HTMLElement).dataset.pdfPage));
        void drain().catch(fail);
      }, { rootMargin: "600px 0px" });
      slots.forEach((slot, index) => { if (!rendered.has(index + 1)) observer!.observe(slot); });
    })().catch(error => { if (!disposed) onError(error instanceof Error ? error.message : "PDF 预览失败"); });
    return () => { disposed = true; observer?.disconnect(); renderTask?.cancel(); void task?.destroy(); host.replaceChildren(); };
  }, [blob, onError]);
  return <div ref={container} data-latex-pdf-preview className="w-full min-w-0 space-y-5" />;
}
