import { inkRanges, safeBookCut } from "./book-pagination";

export function fitHandoutHeader(header: HTMLElement) {
  for (const node of header.querySelectorAll<HTMLElement>(".hn-meta, .hn-running-title")) {
    node.style.fontSize = "";
    let size = parseFloat(getComputedStyle(node).fontSize);
    while (node.scrollWidth > node.clientWidth + 1 && size > 8) {
      size -= .25;
      node.style.fontSize = `${size}px`;
    }
  }
}

export function paginateHandout(measure: HTMLElement, pack: HTMLElement) {
  const mm = measure.getBoundingClientRect().width / 210;
  const pages: HTMLElement[] = [];
  let page!: HTMLElement;
  let body!: HTMLElement;
  const clone = (node: Element) => node.cloneNode(true) as HTMLElement;
  const template = (selector: string) => {
    const node = measure.querySelector(selector);
    if (!node) throw new Error("讲义排版模板缺失");
    return clone(node);
  };
  function newPage() {
    page = document.createElement("article");
    page.className = "exam-page";
    const heads = measure.querySelectorAll(".hn-head");
    page.append(clone(heads[pages.length % heads.length]));
    body = document.createElement("div");
    body.className = "hn-content";
    page.append(body, template(".exam-page-no"));
    pack.append(page);
    pages.push(page);
    page.querySelector(".hn-folio")!.textContent = String(pages.length).padStart(2, "0");
    if (pages.length === 1) body.append(template(".hn-title"));
    fitHandoutHeader(page.querySelector<HTMLElement>(".hn-head")!);
  }
  const limit = () => page.getBoundingClientRect().top + 271 * mm;
  const fits = () => body.getBoundingClientRect().bottom <= limit();
  function fitMath(node: HTMLElement) {
    for (const math of node.querySelectorAll<HTMLElement>(".katex-display > .katex")) {
      math.style.fontSize = "";
      const html = math.querySelector<HTMLElement>(".katex-html");
      const width = math.parentElement!.clientWidth;
      if (html && html.getBoundingClientRect().width > width) {
        math.style.fontSize = `${1.04 * width / html.getBoundingClientRect().width}em`;
      }
    }
  }
  function frame(source: HTMLElement, continued: boolean) {
    const node = source.cloneNode(false) as HTMLElement;
    const legend = clone(source.querySelector("legend")!);
    if (continued) legend.append("（续）");
    node.append(legend);
    body.append(node);
    return node;
  }
  // Oversized paragraphs are split only between text lines, never through math or figures.
  function splitTall(node: HTMLElement, target: HTMLElement, nextTarget: () => HTMLElement) {
    target.append(node);
    fitMath(node);
    const height = node.getBoundingClientRect().height;
    const ink = inkRanges(node);
    let start = 0;
    node.remove();
    while (start < height - .1) {
      const fragment = document.createElement("div");
      fragment.style.cssText = "position:relative;overflow:hidden;display:flow-root";
      const content = clone(node);
      content.style.cssText = `position:absolute;left:0;right:0;top:${-start}px;margin:0;`;
      fragment.append(content);
      target.append(fragment);
      const overhead = body.getBoundingClientRect().bottom - fragment.getBoundingClientRect().top;
      const available = limit() - fragment.getBoundingClientRect().top - overhead - 2;
      const end = Math.min(height, safeBookCut(start, Math.min(height, start + available), ink));
      if (end <= start + 1) throw new Error("单个公式或配图超过整页高度，请缩小后重试");
      fragment.style.height = `${end - start}px`;
      if (!fits()) throw new Error("讲义段落超出页面，请缩短该段落后重试");
      start = end;
      if (start < height - .1) target = nextTarget();
    }
  }
  function addFrame(source: HTMLElement) {
    let target = frame(source, false);
    const blocks = [...source.querySelectorAll<HTMLElement>(":scope > .hn-block")];
    for (const [index, original] of blocks.entries()) {
      const node = clone(original);
      target.append(node);
      fitMath(node);
      if (fits()) continue;
      node.remove();
      const continued = index > 0;
      if (!target.querySelector(".hn-block")) target.remove();
      newPage();
      target = frame(source, continued);
      target.append(node);
      fitMath(node);
      if (!fits()) {
        node.remove();
        splitTall(node, target, () => { newPage(); return target = frame(source, true); });
      }
    }
  }
  pack.replaceChildren();
  newPage();
  let pending: HTMLElement[] = [];
  for (const source of measure.querySelectorAll<HTMLElement>("[data-hn-item]")) {
    if (source.classList.contains("hn-sec")) { pending.push(clone(source)); continue; }
    const question = clone(source.querySelector(".exam-q")!);
    const frames = [...source.querySelectorAll<HTMLElement>(".hn-frame")];
    const writing = source.querySelector<HTMLElement>(".hn-writing");
    const hadContent = !!body.querySelector(".exam-q, .hn-frame");
    body.append(...pending, question);
    fitMath(question);
    const probes: HTMLElement[] = [];
    for (const f of frames) {
      const probe = frame(f, false);
      const blocks = [...f.querySelectorAll(":scope > .hn-block")];
      for (const b of f.dataset.frame === "answer" ? blocks : blocks.slice(0, 1)) probe.append(clone(b));
      fitMath(probe);
      probes.push(probe);
    }
    const keep = fits();
    probes.forEach(p => p.remove());
    if (!keep && hadContent) {
      question.remove();
      pending.forEach(p => p.remove());
      newPage();
      body.append(...pending, question);
      fitMath(question);
    }
    pending = [];
    if (!fits()) {
      question.remove();
      splitTall(question, body, () => { newPage(); return body; });
    }
    for (const f of frames) addFrame(f);
    if (writing) {
      const space = clone(writing);
      body.append(space);
      // Writing space can be shortened at a page boundary; never create an empty page for it.
      space.style.height = `${Math.max(0, Math.min(space.getBoundingClientRect().height, limit() - space.getBoundingClientRect().top - 4 * mm))}px`;
    }
  }
  // Preserve user-authored trailing headings, if any.
  for (const heading of pending) {
    body!.append(heading);
    if (!fits()) { heading.remove(); newPage(); body!.append(heading); }
  }
  return pages;
}
