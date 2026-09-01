import katexCss from "katex/dist/katex.min.css?inline";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { chineseOrdinal, type ExamItem, type HeadingRole, type SheetKind } from "@/lib/paper/layout";
import {
  BLANK_LINE_HEIGHT_MM,
  blankHeightMm,
  hasWrittenAnswer,
  type BlankLines,
} from "@/lib/paper/space";
import { MathText, splitMathPieces } from "@/lib/problems/math-text";
import { splitStemSections } from "@/lib/problems/subproblems";
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
  color: #1a1814;
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
  border: 0.65pt solid #0d9f78;
  color: #0d9f78;
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
  color: #1a7d68;
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
.exam-sheet[data-kind="handout"] .exam-page,
.exam-sheet[data-kind="handout"] .exam-measure {
  padding: 16mm 18mm 18mm 20mm;
}
.exam-sheet[data-kind="handout"] .exam-page-no {
  left: 20mm;
  right: 18mm;
  display: flex;
  justify-content: space-between;
  text-align: left;
  color: #5c574e;
}
.hn-head {
  display: flex;
  flex-direction: column;
  gap: 8pt;
  padding-bottom: 8pt;
  border-bottom: 1.1pt solid #1a1814;
  margin-bottom: 4pt;
}
.hn-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12pt;
}
.hn-title {
  position: relative;
  margin: 10pt 0 8pt;
  text-align: center;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 16pt;
  font-weight: 700;
  letter-spacing: 0.18em;
  line-height: 1.4;
}
.hn-brand { display: flex; align-items: center; gap: 8pt; }
.hn-logo { display: flex; align-items: center; gap: 6pt; }
.hn-logo svg { width: 16pt; height: 16pt; display: block; }
.hn-logo-name {
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 12pt;
  font-weight: 700;
  letter-spacing: 0.16em;
}
.hn-mark {
  padding: 1pt 7pt 0;
  border: 0.7pt solid #0d9f78;
  color: #0d9f78;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 9pt;
  letter-spacing: 0.2em;
}
.hn-meta { max-width: 62%; font-size: 9pt; color: #1a1814; text-align: right; line-height: 1.45; }
.hn-meta-by { display: block; margin-top: 1pt; font-size: 8pt; }
.hn-sec {
  margin: 12pt 0 8pt;
  padding-left: 9pt;
  border-left: 3.2pt solid #0d9f78;
}
.hn-sec-example { border-left-color: #1a1814; }
.hn-sec-practice { border-left-color: #1a1814; }
.hn-sec-title {
  margin: 0;
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  font-size: 11.5pt;
  font-weight: 700;
}
.exam-sheet[data-kind="handout"] .exam-stem {
  padding-left: 2.8em;
  text-indent: -2.8em;
}
.hn-row { display: flex; gap: 12pt; align-items: flex-start; }
.hn-row .exam-figure { margin: 4pt 0 0; flex-shrink: 0; }
.hn-idea {
  margin-top: 7pt;
  padding: 4pt 0 4pt 8pt;
  border-left: 1.2pt solid #1a1814;
  font-size: 10pt;
  line-height: 1.65;
}
.hn-idea b {
  font-family: "Noto Sans SC", "Heiti SC", "STHeiti", "SimHei", sans-serif;
  margin-right: 0.4em;
}
.hn-idea-part { margin: 0; padding-top: 3pt; padding-bottom: 3pt; }
.hn-idea-first { margin-top: 7pt; }
.hn-idea-answer { padding-top: 6pt; }
.hn-lines { margin: 6pt 0 1.15em 2em; }
.hn-lines i {
  display: block;
  height: ${BLANK_LINE_HEIGHT_MM}mm;
  border-bottom: 0.55pt solid #c9c2b4;
}
.hn-lines-auto {
  position: relative;
  display: flow-root;
  min-height: ${BLANK_LINE_HEIGHT_MM * 2}mm;
  max-height: ${BLANK_LINE_HEIGHT_MM * 20}mm;
  overflow: hidden;
}
.hn-lines-auto-rules { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.hn-lines-sizer { visibility: hidden; display: flow-root; min-height: ${BLANK_LINE_HEIGHT_MM * 2}mm; }
.hn-lines-auto .hn-idea { margin: 0; }
.hn-point {
  margin: 2pt 0 2pt 1.2em;
  padding-left: 0;
  list-style: disc;
}
`;

type Block =
  | { kind: "heading"; title: string; role: HeadingRole }
  | { kind: "q"; problem: Problem; index: number; blankLines: BlankLines; role: HeadingRole; label: string }
  | { kind: "analysis"; problem: Problem; index: number }
  | { kind: "handout-answer"; text: string; label?: "思路" | "答案"; first: boolean; answerStart: boolean };

/** 试卷装订线旧俏皮话，暂时不用，改走 MATH_QUIPS。 */
const SEAL_QUIPS = [
  "错过一次就够了，下次换我赢",
  "这不是考试，是和昨天的自己复盘",
  "题目会说话，认真听它把思路讲完",
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

/** 装订处旧文案，暂时不用。 */
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

const MATH_QUIPS: { text: string; by: string }[] = [
  { text: "我算故我在。", by: "笛卡尔大概是这个意思" },
  { text: "没有王者之路通向这页练习。", by: "欧几里得看了想再编一本" },
  { text: "给我一支笔，我能撬动这道题。", by: "阿基米德今天不洗澡" },
  { text: "站在题目的肩膀上。", by: "牛顿说旧坑也是巨人" },
  { text: "我们必须会，我们终将会。", by: "希尔伯特对订正的期望" },
  { text: "空白太小写不下？这页够大。", by: "费马终于肯写步骤" },
  { text: "万物皆可再订正一遍。", by: "毕达哥拉斯数完还要验" },
  { text: "数学好玩，这题先好玩起来。", by: "陈省身鼓励你动笔" },
  { text: "聪明在于把旧坑填上。", by: "华罗庚式勤奋" },
  { text: "上帝不掷骰子，这页也别靠蒙。", by: "爱因斯坦不给运气分" },
  { text: "先画图，再开算。", by: "庞加莱的直觉提醒" },
  { text: "公式记得住，负号别抄反。", by: "欧拉看抄写错误会晕" },
  { text: "不理解也没关系，再写一遍就熟。", by: "冯·诺依曼式习惯" },
  { text: "错因写下来，才算度量过。", by: "开尔文改行督学" },
  { text: "世上不该有两道一模一样的错。", by: "莱布尼茨看见重复题目" },
  { text: "灵感可以来自神，订正必须来自你。", by: "拉马努金也要步骤" },
  { text: "你的笔在思考吗？", by: "图灵停机前来问一句" },
  { text: "会做不等于会，熟了才算会。", by: "高斯不想再改同一题" },
  { text: "我不能订正的，就不算会。", by: "费曼的验收标准" },
  { text: "写得再美也要验一遍。", by: "狄拉克不看颜值" },
  { text: "对和错别叠在同一行。", by: "薛定谔的猫也要选边" },
  { text: "粗心测不准，步骤写清楚。", by: "海森堡改行监考" },
  { text: "符号守恒，步骤才对称。", by: "诺特定理的订正版" },
  { text: "这本练习永远可以再加一页。", by: "哥德尔式不完备" },
  { text: "多算一位，少错一次。", by: "祖冲之还想更准" },
  { text: "步骤才是这题的语言。", by: "伽利略不听空话" },
  { text: "人是会订正的芦苇。", by: "帕斯卡给笔的定义" },
  { text: "1+1 也别在这页算错。", by: "陈景润看见基础坑" },
  { text: "步骤空着，连错都算不上。", by: "泡利最狠的评价" },
  { text: "每天填平一个坑。", by: "陶哲轩的日课" },
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

function splitAnswerText(text: string): string[] {
  const segments: string[] = [];
  let current = "";

  function flush() {
    const value = current.trim();
    if (value) segments.push(value);
    current = "";
  }

  for (const piece of splitMathPieces(text.trim())) {
    if (piece.type === "math" && piece.display) {
      flush();
      segments.push(`$$${piece.value}$$`);
      continue;
    }

    const value = piece.type === "math" ? `$${piece.value}$` : piece.value;
    const lines = value.split("\n");
    current += lines[0] ?? "";
    for (let index = 1; index < lines.length; index += 1) {
      flush();
      current = lines[index] ?? "";
    }
  }
  flush();
  return segments;
}

function QuestionBlock({
  problem,
  index,
  blank,
  blankLines,
  blankAuto,
  role,
  label,
  sheetKind,
  withAnswers,
}: {
  problem: Problem;
  index: number;
  blank?: boolean;
  blankLines: BlankLines;
  blankAuto: boolean;
  role: HeadingRole;
  label: string;
  sheetKind: SheetKind;
  withAnswers: boolean;
}) {
  if (sheetKind === "handout" && role === "points") {
    const text = problem.notes.trim() || problem.title;
    return (
      <div className="hn-point">
        <MathText text={text} inline />
      </div>
    );
  }

  const height = blankHeightMm(problem, blankLines, blankAuto);
  const useSizer = blankAuto && hasWrittenAnswer(problem);
  const mark = <span className="exam-no">{label || `${index + 1}.`}</span>;
  const figures = problem.figures.filter((fig) => fig.image || fig.svg);
  const stemSections = splitStemSections(problem.stem);
  const stemSubproblems = new Set(stemSections.map((section) => section.subproblem).filter(Boolean));
  const looseFigures = figures.filter((figure) => !figure.subproblem || !stemSubproblems.has(figure.subproblem));
  const showLines = sheetKind === "handout" && role !== "points" && !withAnswers;

  return (
    <section className="exam-q">
      {stemSections.map((section, sectionIndex) => (
        <div key={`${section.subproblem}-${sectionIndex}`}>
          <p className="exam-stem">
            {sectionIndex === 0 ? mark : null}
            <MathText text={section.text} inline />
          </p>
          {section.subproblem > 0
            ? figures
                .filter((figure) => figure.subproblem === section.subproblem)
                .map((figure) => (
                  <div key={figure.id} className="exam-figure">
                    {figure.image ? <img src={figure.image} alt="" /> : <div dangerouslySetInnerHTML={{ __html: figure.svg }} />}
                  </div>
                ))
            : null}
        </div>
      ))}
      {sheetKind === "exam"
        ? looseFigures.map((fig) => (
            <div key={fig.id} className="exam-figure">
              {fig.image ? <img src={fig.image} alt="" /> : <div dangerouslySetInnerHTML={{ __html: fig.svg }} />}
            </div>
          ))
        : null}
      <div className={looseFigures.length && sheetKind === "handout" ? "hn-row" : undefined}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {showLines ? (useSizer ? <AutoWriteLines problem={problem} /> : <WriteLines n={blankLines} />) : null}
          {sheetKind === "exam" && blank ? (
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
        </div>
        {sheetKind === "handout"
          ? looseFigures.map((fig) => (
              <div key={fig.id} className="exam-figure">
                {fig.image ? <img src={fig.image} alt="" /> : <div dangerouslySetInnerHTML={{ __html: fig.svg }} />}
              </div>
            ))
          : null}
      </div>
    </section>
  );
}

function IdeaBox({ problem }: { problem: Problem }) {
  if (!problem.correctAnswer.trim() && !problem.analysis.trim()) return null;
  return (
    <div className="hn-idea">
      {problem.analysis.trim() ? (
        <div>
          <b>思路</b>
          <MathText text={problem.analysis} inline />
        </div>
      ) : null}
      {problem.correctAnswer.trim() ? (
        <div style={{ marginTop: problem.analysis.trim() ? "3pt" : 0 }}>
          <b>答案</b>
          <MathText text={problem.correctAnswer} inline />
        </div>
      ) : null}
    </div>
  );
}

function HandoutAnswerPart({
  text,
  label,
  first,
  answerStart,
}: {
  text: string;
  label?: "思路" | "答案";
  first: boolean;
  answerStart: boolean;
}) {
  return (
    <div
      className={`hn-idea hn-idea-part${first ? " hn-idea-first" : ""}${answerStart ? " hn-idea-answer" : ""}`}
    >
      {label ? <b>{label}</b> : null}
      <MathText text={text} inline />
    </div>
  );
}

function WriteLines({ n }: { n: number }) {
  const count = Math.max(2, n);
  return (
    <div className="hn-lines">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

function AutoWriteLines({ problem }: { problem: Problem }) {
  return (
    <div className="hn-lines hn-lines-auto">
      <div className="hn-lines-auto-rules" aria-hidden="true">
        {Array.from({ length: 20 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="hn-lines-sizer">
        <IdeaBox problem={problem} />
      </div>
    </div>
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

function ExamLogo({ inline }: { inline?: boolean }) {
  return (
    <div className={inline ? "hn-logo" : "exam-brand"}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="6.4" fill="#fff" stroke="#1a1814" strokeWidth="1.2" />
        <path d="M7.5 24.5 L16 8.5 L24.5 24.5 Z" fill="none" stroke="#1a1814" strokeWidth="2.1" strokeLinejoin="round" />
        <circle cx="16" cy="19.2" r="3.6" fill="#0d9f78" />
      </svg>
      <span className={inline ? "hn-logo-name" : "exam-brand-name"}>墨题</span>
    </div>
  );
}

function HandoutHead({ quote }: { quote: { text: string; by: string } }) {
  return (
    <header className="hn-head">
      <div className="hn-top">
        <div className="hn-brand">
          <ExamLogo inline />
          <span className="hn-mark">学案</span>
        </div>
        <div className="hn-meta">
          {quote.text}
          <span className="hn-meta-by">——{quote.by}</span>
        </div>
      </div>
    </header>
  );
}

function HandoutTitle({ title, analysis }: { title: string; analysis?: boolean }) {
  if (!title.trim()) return null;
  return (
    <h1 className="hn-title">
      <span>{title}</span>
      {analysis ? <span className="exam-analysis-mark">解析</span> : null}
    </h1>
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

function SectionHead({ title, role, sheetKind }: { title: string; role: HeadingRole; sheetKind: SheetKind }) {
  if (sheetKind === "handout") {
    return (
      <div className={cnRole(role)}>
        <h2 className="hn-sec-title">{title}</h2>
      </div>
    );
  }
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

function cnRole(role: HeadingRole) {
  return `hn-sec${role === "example" ? " hn-sec-example" : role === "practice" ? " hn-sec-practice" : ""}`;
}

function BlockView({
  block,
  blank,
  blankLines,
  blankAuto,
  sheetKind,
  withAnswers,
}: {
  block: Block;
  blank: boolean;
  blankLines: BlankLines;
  blankAuto: boolean;
  sheetKind: SheetKind;
  withAnswers: boolean;
}) {
  if (block.kind === "heading") return <SectionHead title={block.title} role={block.role} sheetKind={sheetKind} />;
  if (block.kind === "analysis") return <AnalysisBlock problem={block.problem} />;
  if (block.kind === "handout-answer") {
    return (
      <HandoutAnswerPart
        text={block.text}
        label={block.label}
        first={block.first}
        answerStart={block.answerStart}
      />
    );
  }
  return (
    <QuestionBlock
      problem={block.problem}
      index={block.index}
      blank={blank}
      blankLines={block.blankLines}
      blankAuto={blankAuto}
      role={block.role}
      label={block.label}
      sheetKind={sheetKind}
      withAnswers={withAnswers}
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
  sheetKind = "exam",
}: {
  title: string;
  dateLabel: string;
  items: ExamItem[];
  withAnswers: boolean;
  blankLines?: BlankLines;
  blankAuto?: boolean;
  sheetKind?: SheetKind;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Block[][]>([]);
  const headingCount = items.filter((item) => item.kind === "heading").length;
  const quoteDeck = useMemo(() => shuffle(MATH_QUIPS), [title, dateLabel, sheetKind]);
  const handout = sheetKind === "handout";

  const blocks = useMemo(() => {
    const next: Block[] = [];
    for (const item of items) {
      if (item.kind === "heading") {
        next.push({ kind: "heading", title: item.title, role: item.role });
      } else {
        next.push({
          kind: "q",
          problem: item.problem,
          index: item.number - 1,
          blankLines: item.blankLines ?? blankLines,
          role: item.role,
          label: item.label,
        });
        if (!handout && withAnswers) {
          next.push({ kind: "analysis", problem: item.problem, index: item.number - 1 });
        } else if (handout && withAnswers) {
          let first = true;
          const ideaParts = splitAnswerText(item.problem.analysis);
          const answerParts = splitAnswerText(item.problem.correctAnswer);
          ideaParts.forEach((text, index) => {
            next.push({
              kind: "handout-answer",
              text,
              label: index === 0 ? "思路" : undefined,
              first,
              answerStart: false,
            });
            first = false;
          });
          answerParts.forEach((text, index) => {
            next.push({
              kind: "handout-answer",
              text,
              label: index === 0 ? "答案" : undefined,
              first,
              answerStart: index === 0,
            });
            first = false;
          });
        }
      }
    }
    return next;
  }, [items, withAnswers, blankLines, handout]);

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
      const topMm = handout ? 16 : 25.4;
      const bottomMm = handout ? 18 : 25.4;
      const inner = (297 - topMm - bottomMm) * pxPerMm - 8 * pxPerMm;
      const head = mount.querySelector("[data-measure='head']") as HTMLElement | null;
      const titleNode = mount.querySelector("[data-measure='title']") as HTMLElement | null;
      const headH = head?.offsetHeight ?? 160;
      const titleH = titleNode?.offsetHeight ?? 0;
      const continuationHeadH = handout ? headH : 0;
      const itemNodes = [...mount.querySelectorAll<HTMLElement>("[data-measure='item']")];

      function spanHeight(from: number, to: number) {
        const start = itemNodes[from];
        const last = itemNodes[to];
        const nextNode = itemNodes[to + 1];
        if (!start || !last) return 0;
        if (nextNode) return nextNode.getBoundingClientRect().top - start.getBoundingClientRect().top;
        const child = (last.firstElementChild as HTMLElement | null) ?? last;
        const mb = parseFloat(getComputedStyle(child).marginBottom) || 0;
        return last.getBoundingClientRect().bottom - start.getBoundingClientRect().top + mb;
      }

      const packed: Block[][] = [];
      const groups: number[][] = [];
      for (let i = 0; i < blocks.length; i += 1) {
        const nextBlock = blocks[i + 1];
        if (
          blocks[i]?.kind === "q" &&
          (nextBlock?.kind === "analysis" || (nextBlock?.kind === "handout-answer" && nextBlock.first))
        ) {
          groups.push([i, i + 1]);
          i += 1;
        } else {
          groups.push([i]);
        }
      }

      let current: Block[] = [];
      let used = headH + titleH;
      for (const idxs of groups) {
        const groupBlocks = idxs.map((i) => blocks[i]).filter(Boolean) as Block[];
        const h = spanHeight(idxs[0] ?? 0, idxs[idxs.length - 1] ?? 0);
        if (current.length && used + h > inner) {
          packed.push(current);
          current = groupBlocks;
          used = continuationHeadH + h;
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
  }, [blocks, title, dateLabel, headingCount, withAnswers, blankLines, blankAuto, handout]);

  const head = handout ? (
    <HandoutHead quote={quoteDeck[0] ?? MATH_QUIPS[0]!} />
  ) : (
    <CoverHead title={title} dateLabel={dateLabel} headingCount={headingCount} analysis={withAnswers} />
  );

  return (
    <div className="exam-sheet" data-kind={sheetKind}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@500;700&display=swap"
      />
      <style>{`${katexCss}\n${EXAM_CSS}`}</style>
      <div className="exam-measure" ref={measureRef}>
        <div data-measure="head">{head}</div>
        {handout ? (
          <div data-measure="title">
            <HandoutTitle title={title} analysis={withAnswers} />
          </div>
        ) : null}
        {blocks.map((block, i) => (
          <div key={`${block.kind}-${i}`} data-measure="item">
            <BlockView
              block={block}
              blank={!withAnswers}
              blankLines={blankLines}
              blankAuto={blankAuto}
              sheetKind={sheetKind}
              withAnswers={withAnswers}
            />
          </div>
        ))}
      </div>

      <div className="exam-pack">
        {pages.map((pageBlocks, pageIndex) => (
          <article key={pageIndex} className="exam-page">
            {handout ? null : (
              <Seal
                msg={(quoteDeck[pageIndex % quoteDeck.length] ?? MATH_QUIPS[0]!).text}
                bind={`——${(quoteDeck[pageIndex % quoteDeck.length] ?? MATH_QUIPS[0]!).by}`}
              />
            )}
            {!handout && pageIndex === 0 ? <ExamLogo /> : null}
            {pageIndex === 0 ? (
              <>
                {head}
                {handout ? <HandoutTitle title={title} analysis={withAnswers} /> : null}
              </>
            ) : handout ? (
              <HandoutHead
                quote={quoteDeck[pageIndex % quoteDeck.length] ?? MATH_QUIPS[0]!}
              />
            ) : null}
            {pageBlocks.map((block, i) => (
              <BlockView
                key={`${block.kind}-${i}`}
                block={block}
                blank={!withAnswers}
                blankLines={blankLines}
                blankAuto={blankAuto}
                sheetKind={sheetKind}
                withAnswers={withAnswers}
              />
            ))}
            <div className="exam-page-no">
              {handout ? (
                <>
                  <span>{title.trim() || "墨题学案"}</span>
                  <span>
                    第 {pageIndex + 1} 页 · 共 {pages.length} 页
                  </span>
                </>
              ) : (
                <>
                  {title} · 第 {pageIndex + 1} 页 · 共 {pages.length} 页
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
