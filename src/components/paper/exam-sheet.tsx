import katexCss from "katex/dist/katex.min.css?inline";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { answerHeightMm } from "@/lib/paper/space";
import type { ExamItem } from "@/lib/paper/layout";
import { MathText } from "@/lib/problems/math-text";
import type { Problem } from "@/lib/problems/types";

const EXAM_CSS = `
.exam-pack { display: flex; flex-direction: column; gap: 18px; align-items: center; }
.exam-page, .exam-measure {
  width: 210mm;
  box-sizing: border-box;
  padding: 10mm 18mm 18mm;
  background: #fff;
  color: #1a1814;
  font-family: "Noto Serif SC", "Songti SC", "STSong", "SimSun", serif;
  font-size: 10.5pt;
  line-height: 1.7;
}
.exam-page {
  position: relative;
  height: 297mm;
  overflow: hidden;
  box-shadow: var(--shadow-border);
}
.exam-page *, .exam-measure * { box-sizing: border-box; }
.exam-head { text-align: center; }
.exam-brand {
  position: absolute;
  left: 18mm;
  top: 10mm;
  display: flex;
  align-items: center;
  gap: 6pt;
  margin: 0;
  z-index: 1;
}
.exam-brand svg { width: 22pt; height: 22pt; display: block; }
.exam-brand-name {
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 11pt;
  font-weight: 650;
  letter-spacing: 0.22em;
}
.exam-title {
  margin: 0;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 16pt;
  font-weight: 700;
  letter-spacing: 0.28em;
  line-height: 1.3;
}
.exam-date {
  margin: 3pt 0 0;
  font-size: 10pt;
  color: #5c574e;
}
.exam-meta {
  display: flex;
  justify-content: space-between;
  gap: 8pt;
  margin: 8pt 0 6pt;
  font-size: 11pt;
}
.exam-meta-item {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 4pt;
  white-space: nowrap;
}
.exam-blank {
  flex: 1;
  border-bottom: 1px solid #1a1814;
  height: 1.05em;
  min-width: 2.4em;
}
.exam-rule {
  border: 0;
  border-top: 1.15pt solid #1a1814;
  margin: 0 0 10pt;
}
.exam-runhead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 9pt;
  color: #5c574e;
  margin: 0 0 6pt;
}
.exam-q { margin: 0 0 12pt; }
.exam-stem {
  margin: 0;
  padding-left: 2em;
  text-indent: -2em;
  font-size: 12pt;
  line-height: 1.85;
}
.exam-no {
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-weight: 700;
  padding-right: 0.4em;
}
.exam-figure { margin: 8pt 0 4pt 2em; max-width: 58mm; }
.exam-figure img, .exam-figure svg {
  display: block;
  max-width: 58mm;
  max-height: 42mm;
  width: auto;
  height: auto;
  object-fit: contain;
  background: #fff;
}
.exam-box {
  margin-top: 8pt;
  border: 0.85pt solid #1a1814;
  padding: 5pt 8pt 8pt;
}
.exam-section {
  margin: 10pt 0 8pt;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 14pt;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.exam-answers-title {
  text-align: center;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 14pt;
  font-weight: 700;
  margin: 4pt 0 12pt;
  letter-spacing: 0.2em;
}
.exam-page-no {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 7mm;
  text-align: center;
  font-size: 9pt;
  color: #6b655c;
}
.exam-measure {
  position: absolute;
  left: -1400px;
  top: 0;
  min-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  visibility: hidden;
  pointer-events: none;
}
.exam-sheet .katex { font-size: 1.05em; }
.exam-sheet .katex-display { margin: 0.35em 0; }
`;

type Block =
  | { kind: "heading"; title: string }
  | { kind: "q"; problem: Problem; index: number }
  | { kind: "answers-title" }
  | { kind: "a"; problem: Problem; index: number };

function QuestionBlock({ problem, index, answer }: { problem: Problem; index: number; answer?: boolean }) {
  if (answer) {
    return (
      <section className="exam-q">
        <p className="exam-stem">
          <span className="exam-no">{index + 1}.</span>
          <MathText text={problem.correctAnswer || "（略）"} inline />
        </p>
        {problem.analysis ? (
          <div style={{ paddingLeft: "2em", marginTop: "6pt", fontSize: "10.5pt" }}>
            <MathText text={problem.analysis} />
          </div>
        ) : null}
      </section>
    );
  }
  return (
    <section className="exam-q">
      <p className="exam-stem">
        <span className="exam-no">{index + 1}.</span>
        <MathText text={problem.stem} inline />
      </p>
      {problem.figures.map((fig) =>
        fig.image || fig.svg ? (
          <div key={fig.id} className="exam-figure">
            {fig.image ? <img src={fig.image} alt="" /> : <div dangerouslySetInnerHTML={{ __html: fig.svg }} />}
          </div>
        ) : null,
      )}
      <div className="exam-box" style={{ minHeight: `${answerHeightMm(problem)}mm` }} />
    </section>
  );
}

function ExamLogo() {
  return (
    <div className="exam-brand">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="6.4" fill="#fff" stroke="#1a1814" strokeWidth="1.2" />
        <path d="M7.5 24.5 L16 8.5 L24.5 24.5 Z" fill="none" stroke="#1a1814" strokeWidth="2.1" strokeLinejoin="round" />
        <circle cx="16" cy="19.2" r="3.4" fill="none" stroke="#b42318" strokeWidth="1.7" />
      </svg>
      <span className="exam-brand-name">墨题</span>
    </div>
  );
}

function CoverHead({ title, dateLabel }: { title: string; dateLabel: string }) {
  return (
    <>
      <header className="exam-head">
        <h1 className="exam-title">{title}</h1>
        <p className="exam-date">{dateLabel}</p>
      </header>
      <div className="exam-meta">
        <div className="exam-meta-item">
          姓名 <span className="exam-blank" />
        </div>
        <div className="exam-meta-item">
          班级 <span className="exam-blank" />
        </div>
        <div className="exam-meta-item">
          学号 <span className="exam-blank" />
        </div>
        <div className="exam-meta-item">
          得分 <span className="exam-blank" />
        </div>
      </div>
      <hr className="exam-rule" />
    </>
  );
}

function RunHead({ title }: { title: string }) {
  return (
    <>
      <div className="exam-runhead">
        <span>{title}</span>
        <span>续</span>
      </div>
      <hr className="exam-rule" />
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === "heading") return <h2 className="exam-section">{block.title}</h2>;
  if (block.kind === "answers-title") return <h2 className="exam-answers-title">参考答案</h2>;
  if (block.kind === "a") return <QuestionBlock problem={block.problem} index={block.index} answer />;
  return <QuestionBlock problem={block.problem} index={block.index} />;
}

export function ExamSheet({
  title,
  dateLabel,
  items,
  withAnswers,
}: {
  title: string;
  dateLabel: string;
  items: ExamItem[];
  withAnswers: boolean;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Block[][]>([]);

  const blocks = useMemo(() => {
    const next: Block[] = [];
    const problems: Problem[] = [];
    for (const item of items) {
      if (item.kind === "heading") {
        next.push({ kind: "heading", title: item.title });
      } else {
        next.push({ kind: "q", problem: item.problem, index: item.number - 1 });
        problems.push(item.problem);
      }
    }
    if (withAnswers) {
      next.push({ kind: "answers-title" });
      for (const [index, problem] of problems.entries()) {
        next.push({ kind: "a", problem, index });
      }
    }
    return next;
  }, [items, withAnswers]);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const measureRoot = root;
    let cancelled = false;

    async function paginate() {
      const imgs = [...measureRoot.querySelectorAll("img")];
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
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (cancelled) return;
      const mount = measureRef.current;
      if (!mount) return;

      const width = mount.clientWidth || 794;
      const pxPerMm = width / 210;
      const inner = (297 - 10 - 18) * pxPerMm - 8;
      const head = mount.querySelector("[data-measure='head']") as HTMLElement | null;
      const run = mount.querySelector("[data-measure='run']") as HTMLElement | null;
      const headH = head?.offsetHeight ?? 120;
      const runH = run?.offsetHeight ?? 36;
      const itemNodes = [...mount.querySelectorAll<HTMLElement>("[data-measure='item']")];

      const packed: Block[][] = [];
      let current: Block[] = [];
      let used = headH;
      let first = true;

      itemNodes.forEach((node, i) => {
        const block = blocks[i];
        if (!block) return;
        const h = node.offsetHeight + 8;
        const forceNew = block.kind === "answers-title";
        const budget = first ? inner : inner - runH;
        if (forceNew || (current.length && used + h > budget)) {
          packed.push(current);
          current = [block];
          used = runH + h;
          first = false;
        } else {
          current.push(block);
          used += h;
        }
      });
      if (current.length) packed.push(current);
      for (let i = 0; i < packed.length - 1; i += 1) {
        const page = packed[i];
        const last = page.at(-1);
        if (last?.kind === "heading") {
          page.pop();
          packed[i + 1].unshift(last);
          if (!page.length) {
            packed.splice(i, 1);
            i -= 1;
          }
        }
      }
      setPages(packed.length ? packed : [[]]);
    }

    void paginate();
    return () => {
      cancelled = true;
    };
  }, [blocks, title, dateLabel]);

  return (
    <div className="exam-sheet">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@500;700&display=swap"
      />
      <style>{`${katexCss}\n${EXAM_CSS}`}</style>
      <div className="exam-measure" ref={measureRef}>
        <div data-measure="head">
          <CoverHead title={title} dateLabel={dateLabel} />
        </div>
        <div data-measure="run">
          <RunHead title={title} />
        </div>
        {blocks.map((block, i) => (
          <div key={`${block.kind}-${i}`} data-measure="item">
            <BlockView block={block} />
          </div>
        ))}
      </div>

      <div className="exam-pack">
        {pages.map((pageBlocks, pageIndex) => (
          <article key={pageIndex} className="exam-page">
            {pageIndex === 0 ? <ExamLogo /> : null}
            {pageIndex === 0 ? <CoverHead title={title} dateLabel={dateLabel} /> : <RunHead title={title} />}
            {pageBlocks.map((block, i) => (
              <BlockView key={`${block.kind}-${i}`} block={block} />
            ))}
            <div className="exam-page-no">
              第 {pageIndex + 1} 页 / {pages.length}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
