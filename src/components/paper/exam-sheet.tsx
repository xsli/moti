import katexCss from "katex/dist/katex.min.css?inline";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { chineseOrdinal, type ExamItem } from "@/lib/paper/layout";
import { blankHeightMm, hasWrittenAnswer, type BlankLines } from "@/lib/paper/space";
import { MathText } from "@/lib/problems/math-text";
import type { Problem } from "@/lib/problems/types";

const EXAM_CSS = `
.exam-pack { display: flex; flex-direction: column; gap: 18px; align-items: center; }
.exam-page, .exam-measure {
  width: 210mm;
  box-sizing: border-box;
  padding: 25.4mm 20.3mm 25.4mm 33mm;
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
.exam-seal {
  position: absolute;
  left: 0;
  top: 25.4mm;
  bottom: 25.4mm;
  width: 28mm;
}
.exam-seal-line {
  position: absolute;
  right: 5mm;
  top: 0;
  bottom: 0;
  border-right: 1px dotted #1a1814;
}
.exam-seal-msg {
  position: absolute;
  left: 3mm;
  top: 10mm;
  bottom: 10mm;
  writing-mode: vertical-rl;
  font-size: 9pt;
  letter-spacing: 0.42em;
}
.exam-seal-bind {
  position: absolute;
  right: 7.2mm;
  top: 18mm;
  writing-mode: vertical-rl;
  font-size: 8pt;
  letter-spacing: 0.55em;
  color: #5c574e;
}
.exam-head { text-align: center; }
.exam-brand {
  position: absolute;
  left: 33mm;
  top: 25.4mm;
  display: flex;
  align-items: center;
  gap: 6pt;
  margin: 0;
  z-index: 1;
}
.exam-brand svg { width: 16pt; height: 16pt; display: block; }
.exam-brand-name {
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 10pt;
  font-weight: 650;
  letter-spacing: 0.22em;
}
.exam-school {
  margin: 0;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 15pt;
  font-weight: 700;
  letter-spacing: 0.16em;
  line-height: 1.45;
}
.exam-title {
  position: relative;
  margin: 0;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 16pt;
  font-weight: 700;
  line-height: 1.4;
}
.exam-course {
  display: inline-block;
  min-width: 7em;
  padding: 0 0.7em 1pt;
  border-bottom: 1.15pt solid #1a1814;
  letter-spacing: 0.28em;
}
.exam-analysis-mark {
  position: absolute;
  margin-left: 8pt;
  padding: 1pt 6pt 0;
  border: 0.65pt solid #1d4ed8;
  color: #1d4ed8;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 9pt;
  font-weight: 500;
  letter-spacing: 0.18em;
  line-height: 1.4;
}
.exam-meta {
  display: flex;
  justify-content: space-between;
  gap: 8pt;
  margin: 10pt 0 8pt;
  font-size: 10.5pt;
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
  min-width: 2.2em;
}
.exam-score {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 10pt;
  font-size: 10.5pt;
}
.exam-score th, .exam-score td {
  border: 0.7pt solid #1a1814;
  text-align: center;
  height: 22pt;
  padding: 2pt 4pt;
  font-weight: 400;
}
.exam-score th:first-child,
.exam-score td:first-child { width: 3.2em; }
.exam-score th:last-child { width: 8em; white-space: nowrap; }
.exam-runhead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 9pt;
  color: #5c574e;
  margin: 0 0 6pt;
}
.exam-rule {
  border: 0;
  border-top: 0.6pt solid #1a1814;
  margin: 0 0 8pt;
}
.exam-q { margin: 0 0 12pt; }
.exam-stem {
  margin: 0;
  padding-left: 2em;
  text-indent: -2em;
  font-size: 10.5pt;
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
  margin-top: 6pt;
  margin-bottom: 1.15em;
  min-height: 10mm;
}
.exam-box-sizer { visibility: hidden; }
.exam-analysis {
  margin: 6pt 0 1.15em 2em;
  color: #1d4ed8;
  font-size: 10.5pt;
  line-height: 1.75;
}
.exam-analysis-label {
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-weight: 700;
  margin-right: 0.45em;
}
.exam-section-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10pt;
  margin: 10pt 0 8pt;
}
.exam-section {
  margin: 0;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 12pt;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.exam-mini-score {
  border-collapse: collapse;
  width: 32pt;
  flex-shrink: 0;
  font-size: 9pt;
}
.exam-mini-score th, .exam-mini-score td {
  border: 0.7pt solid #1a1814;
  text-align: center;
  padding: 2pt 3pt;
  height: 16pt;
}
.exam-mini-score td { height: 20pt; }
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
  left: 33mm;
  right: 20.3mm;
  bottom: 12mm;
  text-align: center;
  font-size: 9pt;
  color: #1a1814;
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
  | { kind: "analysis"; problem: Problem; index: number };

const SEAL_QUIPS = [
  "错过一次就够了，下次换我赢",
  "这不是考试，是和昨天的自己复盘",
  "错题会说话，认真听它把坑讲完",
  "会的先拿下，不会的慢慢磨",
  "复习卷，深呼吸，写完去喝水",
  "别在同一道题上栽第二次",
  "空白处留给明天更聪明的你",
  "墨题在手，旧坑逐个填平",
  "写得慢没关系，想清楚再落笔",
  "先把会做的写漂亮",
  "答案可以慢，思路别乱跑",
  "这页的坑，今天必须填上",
  "算错不可怕，抄错才冤枉",
  "公式记得住，步骤也要写清",
  "不会就画画图，别干瞪眼",
  "今天订正一题，明天少慌一次",
  "草稿纸可以脏，卷面请温柔",
  "题目在考你，你也在训练它",
  "看完题再动笔，少走十分钟弯路",
  "熟练来自重复，不是来自玄学",
  "把粗心抓现行，别让它毕业",
  "这道题眼熟就对了，熟还要会",
  "先求对，再求快，最后求好看",
  "休息一下眼睛，别和符号较劲",
];

const BIND_QUIPS = [
  "线内请勿答题",
  "装订处请留白",
  "这里不写答案",
  "线内禁止神游",
  "订书机的地盘",
  "线里住着订针",
  "装订线请绕行",
  "此处仅供装订",
  "订这里，写那边",
  "线内谢绝演算",
  "别往订口塞字",
  "装订员说谢谢",
  "这条线很内向",
  "针脚处请回避",
  "答案请写右边",
  "线内只装订不思考",
];

function shuffle<T>(list: T[]): T[] {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = next[i];
    const b = next[j];
    if (a === undefined || b === undefined) continue;
    next[i] = b;
    next[j] = a;
  }
  return next;
}

function Seal({ msg, bind }: { msg: string; bind: string }) {
  return (
    <div className="exam-seal" aria-hidden="true">
      <div className="exam-seal-line" />
      <span className="exam-seal-msg">{msg}</span>
      <span className="exam-seal-bind">{bind}</span>
    </div>
  );
}

function ScoreTable({ count }: { count: number }) {
  const parts = Math.max(1, count);
  const labels = Array.from({ length: parts }, (_, i) => chineseOrdinal(i + 1));
  return (
    <table className="exam-score">
      <thead>
        <tr>
          <th>题号</th>
          {labels.map((label) => (
            <th key={label}>{label}</th>
          ))}
          <th>课程考核成绩</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>得分</th>
          {labels.map((label) => (
            <td key={label} />
          ))}
          <td />
        </tr>
      </tbody>
    </table>
  );
}

function QuestionBlock({
  problem,
  index,
  blank,
  blankLines,
  blankAuto,
}: {
  problem: Problem;
  index: number;
  blank?: boolean;
  blankLines: BlankLines;
  blankAuto: boolean;
}) {
  const height = blankHeightMm(problem, blankLines, blankAuto);
  const useSizer = blankAuto && hasWrittenAnswer(problem);
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
      {blank ? (
        useSizer ? (
          <div className="exam-box">
            <div className="exam-box-sizer">
              <AnalysisBlock problem={problem} />
            </div>
          </div>
        ) : (
          <div className="exam-box" style={{ height: `${height}mm`, minHeight: `${height}mm` }} />
        )
      ) : null}
    </section>
  );
}

function AnalysisBlock({ problem }: { problem: Problem }) {
  return (
    <div className="exam-analysis">
      <span className="exam-analysis-label">解析</span>
      <MathText text={problem.correctAnswer || "（略）"} inline />
      {problem.analysis ? (
        <div style={{ marginTop: "4pt" }}>
          <MathText text={problem.analysis} />
        </div>
      ) : null}
    </div>
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

function CoverHead({
  title,
  headingCount,
  analysis,
}: {
  title: string;
  headingCount: number;
  dateLabel?: string;
  analysis?: boolean;
}) {
  return (
    <>
      <header className="exam-head">
        <h1 className="exam-title">
          <span className="exam-course">{title}</span>
          {analysis ? <span className="exam-analysis-mark">解析</span> : null}
        </h1>
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
      <ScoreTable count={headingCount} />
    </>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <div className="exam-section-row">
      <table className="exam-mini-score">
        <thead>
          <tr>
            <th>得分</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td />
          </tr>
        </tbody>
      </table>
      <h2 className="exam-section">{title}</h2>
    </div>
  );
}

function BlockView({
  block,
  blank,
  blankLines,
  blankAuto,
}: {
  block: Block;
  blank: boolean;
  blankLines: BlankLines;
  blankAuto: boolean;
}) {
  if (block.kind === "heading") return <SectionHead title={block.title} />;
  if (block.kind === "analysis") return <AnalysisBlock problem={block.problem} />;
  return (
    <QuestionBlock
      problem={block.problem}
      index={block.index}
      blank={blank}
      blankLines={blankLines}
      blankAuto={blankAuto}
    />
  );
}

export function ExamSheet({
  title,
  dateLabel,
  items,
  withAnswers,
  blankLines = 5,
  blankAuto = false,
}: {
  title: string;
  dateLabel: string;
  items: ExamItem[];
  withAnswers: boolean;
  blankLines?: BlankLines;
  blankAuto?: boolean;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Block[][]>([]);
  const headingCount = items.filter((item) => item.kind === "heading").length;
  const sealDeck = useMemo(
    () => ({ msgs: shuffle(SEAL_QUIPS), binds: shuffle(BIND_QUIPS) }),
    [title, dateLabel],
  );

  const blocks = useMemo(() => {
    const next: Block[] = [];
    for (const item of items) {
      if (item.kind === "heading") {
        next.push({ kind: "heading", title: item.title });
      } else {
        next.push({ kind: "q", problem: item.problem, index: item.number - 1 });
        if (withAnswers) next.push({ kind: "analysis", problem: item.problem, index: item.number - 1 });
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
      const inner = (297 - 25.4 - 25.4) * pxPerMm - 6 * pxPerMm;
      const head = mount.querySelector("[data-measure='head']") as HTMLElement | null;
      const headH = head?.offsetHeight ?? 160;
      const itemNodes = [...mount.querySelectorAll<HTMLElement>("[data-measure='item']")];

      function spanHeight(from: number, to: number) {
        const start = itemNodes[from];
        const last = itemNodes[to];
        const next = itemNodes[to + 1];
        if (!start || !last) return 0;
        if (next) return next.getBoundingClientRect().top - start.getBoundingClientRect().top;
        const child = (last.firstElementChild as HTMLElement | null) ?? last;
        const mb = parseFloat(getComputedStyle(child).marginBottom) || 0;
        return last.getBoundingClientRect().bottom - start.getBoundingClientRect().top + mb;
      }

      const packed: Block[][] = [];
      const groups: number[][] = [];
      for (let i = 0; i < blocks.length; i += 1) {
        if (blocks[i]?.kind === "q" && blocks[i + 1]?.kind === "analysis") {
          groups.push([i, i + 1]);
          i += 1;
        } else {
          groups.push([i]);
        }
      }

      let current: Block[] = [];
      let used = headH;
      for (const idxs of groups) {
        const groupBlocks = idxs.map((i) => blocks[i]).filter(Boolean) as Block[];
        const h = spanHeight(idxs[0], idxs[idxs.length - 1]);
        if (current.length && used + h > inner) {
          packed.push(current);
          current = groupBlocks;
          used = h;
        } else {
          current.push(...groupBlocks);
          used += h;
        }
      }
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
  }, [blocks, title, dateLabel, headingCount, withAnswers, blankLines, blankAuto]);

  return (
    <div className="exam-sheet">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@500;700&display=swap"
      />
      <style>{`${katexCss}\n${EXAM_CSS}`}</style>
      <div className="exam-measure" ref={measureRef}>
        <div data-measure="head">
          <CoverHead title={title} dateLabel={dateLabel} headingCount={headingCount} analysis={withAnswers} />
        </div>
        {blocks.map((block, i) => (
          <div key={`${block.kind}-${i}`} data-measure="item">
            <BlockView block={block} blank={!withAnswers} blankLines={blankLines} blankAuto={blankAuto} />
          </div>
        ))}
      </div>

      <div className="exam-pack">
        {pages.map((pageBlocks, pageIndex) => (
          <article key={pageIndex} className="exam-page">
            <Seal
              msg={sealDeck.msgs[pageIndex % sealDeck.msgs.length] ?? SEAL_QUIPS[0]}
              bind={sealDeck.binds[pageIndex % sealDeck.binds.length] ?? BIND_QUIPS[0]}
            />
            {pageIndex === 0 ? <ExamLogo /> : null}
            {pageIndex === 0 ? (
              <CoverHead title={title} dateLabel={dateLabel} headingCount={headingCount} analysis={withAnswers} />
            ) : null}
            {pageBlocks.map((block, i) => (
              <BlockView key={`${block.kind}-${i}`} block={block} blank={!withAnswers} blankLines={blankLines} blankAuto={blankAuto} />
            ))}
            <div className="exam-page-no">
              {title}　第 {pageIndex + 1} 页　共 {pages.length} 页
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
