export interface InkRange {
  top: number;
  bottom: number;
}

// A line (including its fraction/root) or a figure must stay on one page.
export function safeBookCut(start: number, limit: number, ink: InkRange[]): number {
  let cut = limit;
  for (;;) {
    const crossing = ink.filter((r) => r.top < cut && r.bottom > cut);
    if (!crossing.length) return Math.max(start, cut);
    const next = Math.min(...crossing.map((r) => r.top));
    if (next <= start) return start;
    cut = next;
  }
}

export function bookFragmentEnd(
  start: number,
  available: number,
  height: number,
  contentHeight: number,
  ink: InkRange[],
) {
  const limit = Math.min(height, start + available);
  const complete = limit >= contentHeight;
  return { end: complete ? limit : safeBookCut(start, limit, ink), complete };
}

export function bookContinuationStart(end: number, ink: InkRange[]): number {
  const remaining = ink.filter((r) => r.bottom > end + 0.1);
  return remaining.length ? Math.max(end, Math.min(...remaining.map((r) => r.top)) - 2) : end;
}

function inkRanges(node: HTMLElement): InkRange[] {
  const top = node.getBoundingClientRect().top;
  const ink: InkRange[] = [];
  const add = (rect: DOMRect) => {
    if (rect.width > 0 && rect.height > 0)
      ink.push({ top: rect.top - top - 1, bottom: rect.bottom - top + 1 });
  };
  for (const el of node.querySelectorAll(".katex, img, svg")) {
    if (!el.parentElement?.closest(".katex, svg")) add(el.getBoundingClientRect());
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (
      !text.textContent?.trim() ||
      text.parentElement?.closest(".katex, svg, .exam-box-sizer, .hn-lines-sizer")
    )
      continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const rect of range.getClientRects()) add(rect);
  }
  return ink;
}

/** Reflow measured book content without changing or splitting stored questions. */
export function paginateBookChapter(
  host: HTMLElement,
  signal: AbortSignal,
  prepareHeader?: (header: HTMLElement, pageIndex: number) => void,
): HTMLElement[] {
  const pack = host.querySelector<HTMLElement>(".exam-pack");
  const template = pack?.querySelector<HTMLElement>(".exam-page");
  const source = [...host.querySelectorAll<HTMLElement>(".exam-measure [data-measure='item']")];
  if (!pack || !template || !source.length) throw new Error("章节排版未就绪");
  const head = template.querySelector<HTMLElement>(".hn-head");
  const title = template.querySelector<HTMLElement>(".hn-title");
  const footer = template.querySelector<HTMLElement>(".exam-page-no");
  if (!head || !footer) throw new Error("章节页眉或页脚缺失");
  const blocks = source.map((node, index) => {
    const box = node.getBoundingClientRect();
    const child = node.firstElementChild as HTMLElement | null;
    const gap = child ? Math.max(0, parseFloat(getComputedStyle(child).marginBottom) || 0) : 0;
    const next = source[index + 1];
    const height = Math.max(
      box.height + gap,
      next ? next.getBoundingClientRect().top - box.top : 0,
    );
    const ink = inkRanges(node);
    const contentHeight = Math.min(height, Math.max(0, ...ink.map((r) => r.bottom)) + 2);
    return { node, height, ink, contentHeight };
  });
  pack.replaceChildren();
  const pages: HTMLElement[] = [];
  let body!: HTMLDivElement;
  let capacity = 0;
  let used = 0;
  function newPage() {
    const page = template!.cloneNode(false) as HTMLElement;
    const pageHead = head!.cloneNode(true) as HTMLElement;
    prepareHeader?.(pageHead, pages.length);
    page.append(pageHead);
    if (!pages.length && title) page.append(title.cloneNode(true));
    body = document.createElement("div");
    body.className = "book-page-content";
    body.style.display = "flow-root";
    const pageFooter = footer!.cloneNode(true) as HTMLElement;
    page.append(body, pageFooter);
    pack!.append(page);
    pages.push(page);
    capacity = pageFooter.getBoundingClientRect().top - 16 - body.getBoundingClientRect().top;
    if (capacity < 100) throw new Error("章节标题过长，正文空间不足");
    used = 0;
  }
  newPage();
  for (const [index, block] of blocks.entries()) {
    signal.throwIfAborted();
    let start = 0;
    while (start < block.height - 0.1) {
      signal.throwIfAborted();
      let available = capacity - used;
      // Ordinary questions stay together; only oversized blocks continue across pages.
      if (
        used > 0 &&
        (available < 72 ||
          (start === 0 && block.contentHeight > available && block.contentHeight <= capacity))
      ) {
        newPage();
        available = capacity;
      }
      const { end, complete } = bookFragmentEnd(
        start,
        available,
        block.height,
        block.contentHeight,
        block.ink,
      );
      if (end <= start + 1) {
        if (used > 0) {
          newPage();
          continue;
        }
        throw new Error("单个公式或配图超过整页高度，请缩小该公式或配图后重试");
      }
      const fragment = document.createElement("div");
      fragment.dataset.bookSource = String(index);
      fragment.dataset.bookStart = String(start);
      fragment.dataset.bookEnd = String(end);
      fragment.style.cssText = `position:relative;overflow:hidden;height:${end - start}px;`;
      const clone = block.node.cloneNode(true) as HTMLElement;
      clone.style.cssText = `position:absolute;left:0;top:${-start}px;width:100%;display:flow-root;`;
      // The measured wrapper starts after its child's collapsed top margin.
      if (clone.firstElementChild instanceof HTMLElement)
        clone.firstElementChild.style.marginTop = "0";
      fragment.append(clone);
      body.append(fragment);
      used += end - start;
      if (complete) break;
      start = bookContinuationStart(end, block.ink);
      newPage();
    }
  }
  return pages;
}
