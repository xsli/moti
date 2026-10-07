import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ReactNode } from "react";
import { PDFDocument } from "pdf-lib";
import { createPaperQuoteDeck, ExamSheet } from "@/components/paper/exam-sheet";
import { getNotebook, getProblemFn } from "@/lib/problems/api";
import type { Problem } from "@/lib/problems/types";
import {
  bookChapterItems,
  bookChapters,
  bookContents,
  selectBookChapters,
  BOOK_TOC_PAGE_SIZE,
} from "./book";
import { appendBookPdfPage } from "./pdf";
import { fitHandoutHeader } from "./handout-pagination";
import type { BlankLines } from "./space";

export interface BookExportOptions {
  folder: string;
  title: string;
  withAnswers: boolean;
  blankLines: BlankLines;
  dpi: number;
  chapterIds: string[];
}

function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("已取消", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("读取或排版超时，请重试"));
    }, 120_000);
    signal.addEventListener("abort", abort, { once: true });
    work.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

const frontStyle = {
  width: 794,
  height: 1123,
  padding: "80px 76px",
  background: "white",
  color: "#000",
  fontFamily: '"Songti SC", "STSong", "SimSun", serif',
  position: "relative" as const,
  boxSizing: "border-box" as const,
};

export async function exportBook(
  options: BookExportOptions,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<{ blob: Blob; pages: number; problems: number }> {
  progress("读取大组目录…");
  const notebook = await bounded(getNotebook(), signal);
  const chapters = selectBookChapters(
    bookChapters(options.folder, notebook.collections, notebook.problems),
    options.chapterIds,
  );
  if (!chapters.length) throw new Error("这个大组还没有题目");
  const problemCount = chapters.reduce((n, c) => n + c.problemIds.length, 0);
  const frontCount = 1 + Math.ceil(chapters.length / BOOK_TOC_PAGE_SIZE);
  const pdf = await PDFDocument.create();
  pdf.setTitle(options.title);
  pdf.setCreator("解集");
  const pageCounts: number[] = [];
  const quoteDeck = createPaperQuoteDeck();
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-12000px;top:0;width:794px;pointer-events:none;background:white;";
  host.setAttribute("aria-hidden", "true");
  document.body.append(host);
  let loaded = 0;
  try {
    for (const [index, chapter] of chapters.entries()) {
      signal.throwIfAborted();
      const problems: Problem[] = [];
      for (const id of chapter.problemIds) {
        progress(`读取题目 ${loaded + 1}/${problemCount} · ${chapter.title}`);
        const problem = await bounded(getProblemFn({ data: { id } }), signal);
        if (!problem || problem.collectionId !== chapter.id)
          throw new Error(`「${chapter.title}」题目已被移动或删除，请重新导出`);
        // Source screenshots are not printed; keep only the actual figures in memory.
        problems.push({ ...problem, sourceImage: undefined });
        loaded += 1;
      }
      let ready!: () => void;
      let failed!: (error: unknown) => void;
      const settled = new Promise<void>((resolve, reject) => {
        ready = resolve;
        failed = reject;
      });
      const root = createRoot(host, { onUncaughtError: failed });
      try {
        progress(`排版 ${index + 1}/${chapters.length} · ${chapter.title}`);
        root.render(
          <ExamSheet
            title={chapter.title}
            groupName={options.folder}
            dateLabel=""
            items={bookChapterItems(problems, options.blankLines)}
            withAnswers={options.withAnswers}
            blankLines={options.blankLines}
            sheetKind="handout"
            localFonts
            onReady={ready}
            onError={(message) => failed(new Error(message))}
          />,
        );
        await bounded(settled, signal);
        if (host.querySelector(".katex-error"))
          throw new Error(`「${chapter.title}」有无法显示的公式，请修正后导出`);
        // Use final book page order, including continuation pages, across chapters.
        const pageOffset = pdf.getPageCount();
        const pages = [...host.querySelectorAll<HTMLElement>(".exam-pack .exam-page")];
        pages.forEach((page, pageIndex) => {
          const header = page.querySelector<HTMLElement>(".hn-head")!;
          const quote = quoteDeck[(pageOffset + pageIndex) % quoteDeck.length];
          const meta = header.querySelector<HTMLElement>(".hn-meta");
          const by = meta?.querySelector<HTMLElement>(".hn-meta-by");
          if (!quote || !meta || !by) throw new Error("章节名言页眉缺失");
          by.textContent = `——${quote.person}`;
          meta.replaceChildren(document.createTextNode(quote.text.replace(/。$/, "")), by);
          fitHandoutHeader(header);
        });
        if (!pages.length) throw new Error(`「${chapter.title}」排版失败`);
        pageCounts.push(pages.length);
        for (const [pageIndex, page] of pages.entries()) {
          signal.throwIfAborted();
          const footer = page.querySelector<HTMLElement>(".exam-page-no");
          if (footer?.lastElementChild)
            footer.lastElementChild.textContent = `第 ${frontCount + pdf.getPageCount() + 1} 页`;
          const bottom =
            footer?.getBoundingClientRect().top ?? page.getBoundingClientRect().bottom - 40;
          const content = [...page.children].filter((el) => !el.classList.contains("exam-page-no"));
          if (content.some((el) => el.getBoundingClientRect().bottom > bottom + 2)) {
            throw new Error(
              `「${chapter.title}」第${pageIndex + 1}页排版异常，请重试`,
            );
          }
          progress(
            `生成章节 ${index + 1}/${chapters.length} · ${chapter.title} · 第 ${pageIndex + 1}/${pages.length} 页`,
          );
          await appendBookPdfPage(pdf, page, { signal, dpi: options.dpi });
        }
      } finally {
        root.unmount();
      }
    }
    const contents = bookContents(chapters, pageCounts);
    const totalPages = frontCount + pdf.getPageCount();
    const front: ReactNode[] = [
      <div style={frontStyle} key="cover">
        <div style={{ borderBottom: "2px solid #18231f", paddingBottom: 18, fontSize: 22 }}>
          解集
        </div>
        <h1
          style={{
            marginTop: 170,
            fontSize: 36,
            fontWeight: 700,
            lineHeight: 1.6,
            overflowWrap: "anywhere",
          }}
        >
          {options.title}
        </h1>
        <div style={{ marginTop: 40, fontSize: 18 }}>
          {chapters.length} 章 · {problemCount} 道题
        </div>
        <div style={{ marginTop: 12, fontSize: 16 }}>
          {options.withAnswers ? "题目与已有答案解析" : "题目版"}
        </div>
        <div style={{ position: "absolute", bottom: 80, fontSize: 14 }}>
          {new Date().toLocaleDateString("zh-CN")}
        </div>
      </div>,
    ];
    for (let start = 0; start < contents.length; start += BOOK_TOC_PAGE_SIZE) {
      front.push(
        <div style={frontStyle} key={start}>
          <h1 style={{ fontSize: 28, marginBottom: 30 }}>目录{start ? "（续）" : ""}</h1>
          {contents.slice(start, start + BOOK_TOC_PAGE_SIZE).map((entry) => (
            <div
              key={entry.id}
              style={{
                display: "flex",
                gap: 16,
                alignItems: "baseline",
                padding: "8px 0",
                borderBottom: "1px solid #e2e5e3",
                fontSize: 14,
                lineHeight: 1.4,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{entry.title}</span>
              <span style={{ whiteSpace: "nowrap" }}>
                {entry.problemIds.length} 题
              </span>
              <span style={{ width: 30, textAlign: "right" }}>{entry.page}</span>
            </div>
          ))}
          <div style={{ position: "absolute", bottom: 50, right: 76, fontSize: 12 }}>
            第 {front.length + 1} 页 · 共 {totalPages} 页
          </div>
        </div>,
      );
    }
    for (const [i, node] of front.entries()) {
      progress(`生成封面与目录 ${i + 1}/${front.length}`);
      const root = createRoot(host);
      try {
        flushSync(() => root.render(node));
        await appendBookPdfPage(pdf, host.firstElementChild as HTMLElement, {
          signal,
          dpi: options.dpi,
          index: i,
        });
      } finally {
        root.unmount();
      }
    }
    signal.throwIfAborted();
    progress(`整理 PDF · 共 ${pdf.getPageCount()} 页…`);
    const bytes = await pdf.save();
    signal.throwIfAborted();
    return {
      blob: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
      pages: pdf.getPageCount(),
      problems: problemCount,
    };
  } finally {
    host.remove();
  }
}
