import katexCss from "katex/dist/katex.min.css?inline";
import css from "./handout-sheet.css?inline";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MathText, splitMathPieces } from "@/lib/problems/math-text";
import { splitStemSections } from "@/lib/problems/subproblems";
import { handoutItems, type ExamItem } from "@/lib/paper/layout";
import { blankHeightMm } from "@/lib/paper/space";
import { paginateHandout } from "@/lib/paper/handout-pagination";
import { handoutAnswerItems, type AnswerPlacement } from "@/lib/paper/answer-placement";
import type { Figure } from '@/lib/problems/types';

const Text = memo(MathText);
function chunks(text: string) {
  const result: string[] = [];
  let current = "";
  const flush = () => { if (current.trim()) result.push(current.trim()); current = ""; };
  for (const piece of splitMathPieces(text)) {
    if (piece.type === "math") {
      if (piece.display) { current += `\n$$${piece.value}$$`; flush(); }
      else current += `$${piece.value}$`;
    } else {
      const lines = piece.value.split("\n");
      current += lines[0];
      for (const line of lines.slice(1)) {
        if (line.trim()) { flush(); current = line; }
      }
    }
  }
  flush();
  return result;
}
const Paragraphs = memo(function Paragraphs({ text, figures }: { text: string; figures?: Figure[] }) {
  return chunks(text).map((part, i) => <div className="hn-block" key={i}>
    <Text className="hn-text" text={part} figures={figures} tight />
  </div>);
});
function Frame({ kind, text, figures, practice = false }: { kind: "answer" | "analysis"; text: string; figures?: Figure[]; practice?: boolean }) {
  if (!text.trim()) return null;
  return <fieldset className={`hn-frame${practice ? " hn-frame-practice" : ""}`} data-frame={kind}><legend>{kind === "answer" ? "答案" : "解析"}</legend><Paragraphs text={text} figures={figures} /></fieldset>;
}
function Title({ title }: { title: string }) {
  const lecture = title.trim().match(/^第\s*([0-9０-９一二三四五六七八九十百零〇两]+)\s*([讲章课节])\s*[：:、.．-]?\s*(.+)$/);
  return <div className="hn-title">
    <h1>{lecture ? <>
      <span className="hn-lecture-badge">
        <svg viewBox="0 0 180 84" preserveAspectRatio="none" aria-hidden="true">
          <path d="M72 5 H28 Q5 5 5 28 V75 L12 68 V28 Q12 12 28 12 H65 Z M175 5 L168 12 V56 Q168 72 152 72 H118 L111 79 H152 Q175 79 175 56 Z" fill="#008675" />
          <rect x="38" y="72" width="8" height="8" fill="#82be9c" /><rect x="62" y="72" width="8" height="8" fill="#e98820" /><rect x="86" y="72" width="8" height="8" fill="#008675" />
        </svg>
        <span>第 {lecture[1]} {lecture[2]}</span>
      </span>
      <span className="hn-lecture-name">{lecture[3]}</span>
    </> : <span className="hn-lecture-name">{title}</span>}</h1>
  </div>;
}
function Section({ title, leading }: { title: string; leading: boolean }) {
  const label = title.replace(/^[一二三四五六七八九十]+、/, "").trim();
  if (leading && /^(例题|习题)$/.test(label)) return null;
  return <div className="hn-sec" data-hn-item data-section={label}>
    {!leading ? <span className="hn-section-rule" role="separator" aria-label={label} /> : null}
    {!/^(例题|习题)$/.test(label) ? <h2 className="hn-sec-title">{label}</h2> : null}
  </div>;
}
const Question = memo(function Question({ item, withAnswers, blankAuto }: {
  item: Extract<ExamItem, { kind: "problem" }>; withAnswers: boolean; blankAuto: boolean;
}) {
  const p = item.problem;
  const sections = splitStemSections(p.stem);
  const subs = new Set(sections.map(s => s.subproblem).filter(Boolean));
  const figures = p.figures.filter(f => !f.inline && (f.image || f.svg));
  const figure = (f: typeof figures[number]) => <div className="exam-figure" key={f.id}>
    {f.image ? <img src={f.image} alt="" /> : <div dangerouslySetInnerHTML={{ __html: f.svg }} />}
  </div>;
  return <div data-hn-item>
    <article className={`exam-q ${item.role === "practice" ? "hn-exercise" : item.role === "example" ? "hn-example" : ""}`} data-problem={p.id}>
      {item.role === "example" || item.role === "practice" ? <div className="hn-question-heading"><span className={item.role === "example" ? "hn-example-no" : "hn-exercise-no"}>{item.label}</span></div> : null}
      {item.role === "points" ? <Paragraphs text={p.notes.trim() || p.title} /> : sections.map((s, i) => <div key={i}>
        <Paragraphs text={s.text} figures={p.figures} />
        {s.subproblem > 0 ? figures.filter(f => f.subproblem === s.subproblem).map(figure) : null}
      </div>)}
      {figures.filter(f => !f.subproblem || !subs.has(f.subproblem)).map(figure)}
    </article>
    {withAnswers ? <><Frame kind="answer" text={p.correctAnswer} figures={p.figures} practice={item.role === "practice"} /><Frame kind="analysis" text={p.analysis} figures={p.figures} practice={item.role === "practice"} /></>
      : item.role !== "points" ? <div className="hn-writing" style={{ height: `${blankHeightMm(p, item.blankLines, blankAuto)}mm` }} /> : null}
  </div>;
});

function Answer({ item }: { item: Extract<ExamItem, { kind: "problem" }> }) {
  const p = item.problem;
  const practice = item.role === "practice";
  return <div data-hn-item data-answer-for={p.id}>
    <article className={`exam-q hn-answer-heading ${practice ? "hn-exercise" : "hn-example"}`} data-answer-problem={p.id}>
      <div className="hn-question-heading"><span className={practice ? "hn-exercise-no" : "hn-example-no"}>{item.label}</span></div>
      <span>{practice ? "习题" : "例题"} {item.label}</span>
    </article>
    <Frame kind="answer" text={p.correctAnswer} figures={p.figures} practice={practice} />
    <Frame kind="analysis" text={p.analysis} figures={p.figures} practice={practice} />
    {!p.correctAnswer.trim() && !p.analysis.trim() ? <Frame kind="answer" text="暂未录入答案与解析" practice={practice} /> : null}
  </div>;
}

export function HandoutSheet({ title, groupName = "", items, withAnswers, answerPlacement = "inline", blankAuto = false, quotes, onReady, onError }: {
  title: string; groupName?: string; items: ExamItem[]; withAnswers: boolean; blankAuto?: boolean;
  answerPlacement?: AnswerPlacement;
  quotes: { text: string; person: string }[]; onReady?: () => void; onError?: (message: string) => void;
}) {
  const measure = useRef<HTMLDivElement>(null);
  const pack = useRef<HTMLDivElement>(null);
  const normalized = useMemo(() => handoutItems(items), [items]);
  const appendix = useMemo(() => withAnswers && answerPlacement === "end" ? handoutAnswerItems(normalized) : [], [normalized, withAnswers, answerPlacement]);
  const input = useMemo(() => ({ title, groupName, normalized, withAnswers, answerPlacement, blankAuto, quotes }), [title, groupName, normalized, withAnswers, answerPlacement, blankAuto, quotes]);
  const [complete, setComplete] = useState<object | null>(null);
  const [error, setError] = useState("");
  const ready = complete === input;
  useLayoutEffect(() => { if (ready) onReady?.(); }, [ready, onReady]);
  useLayoutEffect(() => {
    let cancelled = false;
    const source = measure.current!;
    const output = pack.current!;
    setError("");
    async function layout() {
      const loaded = await Promise.all([document.fonts.load('11pt HandoutSourceHan'), document.fonts.load('600 11pt HandoutSourceHan')]);
      if (loaded.some(fonts => !fonts.length)) throw new Error("思源宋体加载失败，请刷新重试");
      await Promise.all([...source.querySelectorAll("img")].map(img => img.decode()));
      await document.fonts.ready;
      await new Promise(requestAnimationFrame);
      if (cancelled) return;
      paginateHandout(source, output);
      setComplete(input);
    }
    void layout().catch(e => {
      if (cancelled) return;
      output.replaceChildren();
      const message = e instanceof Error ? e.message : "讲义排版失败，请重试";
      setError(message);
      onError?.(message);
    });
    return () => { cancelled = true; };
  }, [input, onError]);
  return <div className="exam-sheet handout-sheet" data-kind="handout" aria-busy={!ready}>
    <style>{`${katexCss}\n${css}`}</style>
    {error ? <p role="alert">{error}</p> : null}
    <div className="exam-measure" ref={measure} aria-hidden="true">
      {quotes.map((quote, i) => <header className="hn-head" key={i}>
        <span className="hn-header-rule" aria-hidden="true" />
        <div className="hn-running-title">{title}</div>
        <div className="hn-meta">{quote.text.replace(/。$/, "")}<span className="hn-meta-by">——{quote.person}</span></div>
      </header>)}
      <Title title={title} />
      {normalized.map((item, i) => item.kind === "heading" ? <Section title={item.title} leading={i === 0} key={i} />
        : <Question key={item.problem.id} item={item} withAnswers={withAnswers && answerPlacement === "inline"} blankAuto={blankAuto} />)}
      {appendix.length ? <>
        <div className="hn-sec hn-answer-title" data-hn-item data-page-break="before"><h2>参考答案与解析</h2></div>
        {appendix.map((item, i) => item.kind === "heading"
          ? <div className="hn-sec" data-hn-item key={`heading-${i}`}><h3 className="hn-sec-title">{item.title}</h3></div>
          : <Answer key={item.problem.id} item={item} />)}
      </> : null}
      <footer className="exam-page-no"><span className="hn-footer-line" /><span className="hn-folio" /></footer>
    </div>
    <div className="exam-pack" ref={pack} aria-hidden={!ready} style={ready ? undefined : { visibility: "hidden" }} />
  </div>;
}
