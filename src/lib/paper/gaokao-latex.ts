import type { ExamItem } from "./layout";
import type { Figure, Problem } from "../problems/types";
import { assertMathTexSafe } from "./math-tex-safety.ts";

export const EXAM_ZH_REVISION = "afffaeac068a2ba2b3bb39cc8c3878840f701ea0";
export const EXAM_ZH_FILES = [
  "exam-zh.cls", "exam-zh-chinese.sty", "exam-zh-choices.sty",
  "exam-zh-circlednumber.sty", "exam-zh-counter.sty", "exam-zh-english.sty",
  "exam-zh-font.sty", "exam-zh-math.sty", "exam-zh-question.sty",
  "exam-zh-symbols.sty", "exam-zh-textfigure.sty", "LICENSE", "MANIFEST.md",
] as const;

export interface GaokaoLatexOptions {
  title: string;
  withAnswers: boolean;
  minutes?: number;
  solutionSpaceCm?: number;
}

type Token = { kind: "text" | "math" | "display" | "figure"; value: string };

// Keep math and picture tokens intact while escaping prose. In particular,
// never treat A./B. inside a formula as option labels.
function tokenize(input: string): Token[] {
  const result: Token[] = [];
  const re = /!\[[^\]\n]*\]\(figure:([A-Za-z0-9_-]{1,80})\)|(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$|(?<!\\)\$([^$]*?)(?<!\\)\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;
  let cursor = 0;
  for (const m of input.matchAll(re)) {
    if (m.index! > cursor) result.push({ kind: "text", value: input.slice(cursor, m.index) });
    result.push(m[1] ? { kind: "figure", value: m[1] } : {
      kind: m[2] !== undefined || m[4] !== undefined ? "display" : "math",
      value: m[2] ?? m[3] ?? m[4] ?? m[5],
    });
    cursor = m.index! + m[0].length;
  }
  if (cursor < input.length) result.push({ kind: "text", value: input.slice(cursor) });
  return result;
}

export function escapeLatexText(text: string): string {
  const escapes: Record<string, string> = {
    "\\": "\\textbackslash{}", "&": "\\&", "%": "\\%", "$": "\\$",
    "#": "\\#", "_": "\\_", "{": "\\{", "}": "\\}",
    "~": "\\textasciitilde{}", "^": "\\textasciicircum{}",
  };
  return text.replace(/[\\&%$#_{}~^\u2200-\u22ffΑ-Ωα-ω△▲]/g,
    c => escapes[c] ?? `\\ensuremath{${c === "△" ? "\\triangle" : c === "▲" ? "\\blacktriangle" : c}}`);
}

export function splitGaokaoChoices(stem: string): { stem: string; choices: string[] } | null {
  // Recognize the importer's exact image-table form, with either four columns
  // or two label/image row pairs. Never infer missing labels from image order.
  const table = /\$\$\\begin\{array\}\{[c|]+\}([\s\S]*?)\\end\{array\}\$\$\s*$/.exec(stem);
  if (table) {
    const cell = /\\text\{([A-D][.．]?|!\[[^\]{}]*\]\(figure:[A-Za-z0-9_-]{1,80}\))\}/g;
    const tokens = [...table[1].matchAll(cell)].map(m => m[1]);
    const remainder = table[1].replace(cell, "").replace(/\\hline|\\\\|&|\s/g, "");
    const labels: string[] = [], pairs: { label: string; image: string }[] = [];
    for (const token of tokens) {
      if (/^[A-D]/.test(token)) labels.push(token[0]);
      else pairs.push({ label: labels.shift() ?? "", image: token });
    }
    if (!remainder && !labels.length && pairs.map(p => p.label).join("") === "ABCD") {
      return { stem: stem.slice(0, table.index).trim(), choices: pairs.map(p => p.image) };
    }
  }
  const masked = stem.replace(/(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<!\\)\$[^$]*?(?<!\\)\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g,
    s => "\0".repeat(s.length));
  const matches = [...masked.matchAll(/(?:^|[\s\u3000])([A-D])[.．、]/g)];
  if (matches.length !== 4 || matches.map(m => m[1]).join("") !== "ABCD") return null;
  const choices = matches.map((m, i) => stem.slice(m.index! + m[0].length, matches[i + 1]?.index ?? stem.length).trim());
  if (choices.some(c => !c)) return null;
  return { stem: stem.slice(0, matches[0].index).trim(), choices };
}

function questionType(p: Problem): string {
  return ["单选题", "多选题", "填空题", "解答题", "选考题"].find(t => p.tags.includes(t)) ?? "综合题";
}

function score(p: Problem): number | undefined {
  // This is the explicit score field written by the Gaokao importer, not a
  // heuristic based on the year or the position of the question.
  const match = p.notes.match(/(?:^|\n)分值：([1-9]\d*)分[。\s]*(?:\n|$)/);
  return match ? Number(match[1]) : undefined;
}

export interface GaokaoSource {
  student: string;
  teacher?: string;
  assets: { path: string; figure: Figure }[];
  warnings: string[];
}

export function buildGaokaoLatex(items: ExamItem[], options: GaokaoLatexOptions): GaokaoSource {
  const questions = items.filter(i => i.kind === "problem");
  if (!questions.length) throw new Error("请先选择题目");
  const minutes = options.minutes ?? 120;
  const space = options.solutionSpaceCm ?? 5;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 600 || !Number.isFinite(space) || space < 0 || space > 15) {
    throw new Error("考试时长或解答题留白超出范围");
  }
  const assets: GaokaoSource["assets"] = [];
  const paths = new Map<string, string>();
  const warnings = new Set<string>();
  const picture = (p: Problem, id: string, mathWidth?: number): string => {
    const figure = p.figures.find(f => f.id === id);
    if (!figure || (!figure.image && !figure.svg)) throw new Error(`${p.title}：配图 ${id} 尚未加载`);
    const key = `${p.id}\0${id}`;
    let path = paths.get(key);
    if (!path) {
      const ext = figure.image?.startsWith("data:image/jpeg") ? "jpg" : "png";
      path = `images/figure-${String(assets.length + 1).padStart(3, "0")}.${ext}`;
      paths.set(key, path);
      assets.push({ path, figure });
    }
    if (mathWidth) return `\\includegraphics[width=${mathWidth}\\textwidth,height=4cm,keepaspectratio]{${path}}`;
    return `\n\\par\\begingroup\\centering\n\\includegraphics[width=0.72\\linewidth,height=0.28\\textheight,keepaspectratio]{${path}}\\par\\endgroup\n`;
  };
  const tex = (input: string, p: Problem, choice = false): string => tokenize(input).map(t => {
    if (t.kind === "figure") return picture(p, t.value, choice ? 0.35 : undefined);
    if (t.kind === "math" || t.kind === "display") {
      try { assertMathTexSafe(t.value); }
      catch (error) { throw new Error(`${p.title}：${(error as Error).message}`); }
      // Imported Markdown tables may contain picture references inside
      // \text cells of a math array. Resolve those as non-floating graphics.
      const columns = t.value.match(/\\begin\{array\}\{([clr|]+)\}/)?.[1].replaceAll("|", "").length ?? 4;
      const value = t.value.replace(/!\[[^\]\n]*\]\(figure:([A-Za-z0-9_-]{1,80})\)/g,
        (_, id: string) => picture(p, id, Math.min(0.4, 0.8 / columns)));
      return t.kind === "display" ? `\n\\MotiDisplay{${value}}\n`
        : value.length > 60 ? `\\MotiInline{${value}}` : `$${value}$`;
    }
    return t.value.split(/(_{3,}|（\s*）)/).map(s => /^_{3,}$/.test(s) ? "\\fillin{}" : /^（\s*）$/.test(s) ? "\\paren{}" : escapeLatexText(s))
      .join("").replace(/\r?\n+/g, "\n\\par\n");
  }).join("");

  for (const { problem: p } of questions) {
    if (p.tags.includes("待核对")) warnings.add(`${p.title}：题库标记为待核对，请参阅原卷。`);
    if (options.withAnswers && !p.correctAnswer.trim()) warnings.add(`${p.title}：原数据未单列答案。`);
    if (options.withAnswers && !p.analysis.trim()) warnings.add(`${p.title}：原数据缺少解析。`);
  }
  const explicitSections = items.some(i => i.kind === "heading");
  const makeBody = (answers: boolean) => {
    let previousType = "", sectionNo = 0, number = 0;
    const body: string[] = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.kind === "heading") {
        body.push(`\\Needspace{5\\baselineskip}\\section*{${escapeLatexText(item.title)}}`);
        continue;
      }
      number++;
      const p = item.problem, type = questionType(p);
      if (!explicitSections && previousType !== type) {
        sectionNo++;
        const run: Problem[] = [];
        for (const next of items.slice(index)) {
          if (next.kind !== "problem" || questionType(next.problem) !== type) break;
          run.push(next.problem);
        }
        const scores = run.map(score);
        const points = scores.every(s => s !== undefined) ? `，共${scores.reduce((a, b) => a! + b!, 0)}分` : "";
        const ordinal = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][sectionNo] ?? String(sectionNo);
        body.push(`\\Needspace{5\\baselineskip}\\section*{${ordinal}、${type}（共${run.length}题${points}）}`);
        previousType = type;
      }
      const isChoice = type === "单选题" || type === "多选题";
      const parsed = isChoice ? splitGaokaoChoices(p.stem) : null;
      if (isChoice && !parsed) warnings.add(`${p.title}：选项未能可靠识别为 A–D，按原文保留。`);
      const env = type === "解答题" || type === "选考题" || type === "综合题" ? "problem" : "question";
      const points = item.points ?? score(p);
      body.push(`\\Needspace{3\\baselineskip}\n\\begin{${env}}[index=${number}${points === undefined ? "" : `,points=${points}`}]`);
      body.push(tex(parsed?.stem ?? p.stem, p));
      if (parsed) body.push("\\begin{MotiChoices}", ...parsed.choices.map(c => `\\item ${tex(c, p, true)}`), "\\end{MotiChoices}");
      for (const f of p.figures.filter(f => !f.inline)) body.push(picture(p, f.id));
      if (answers) {
        body.push("\\begin{solution}", "\\fontsize{11}{18}\\selectfont", "\\textbf{答案：}" + (p.correctAnswer.trim() ? tex(p.correctAnswer, p) : "原数据未单列，参见解析。"));
        body.push("\\par\\smallskip\\textbf{解析：}" + (p.analysis.trim() ? tex(p.analysis, p) : "原数据未提供。"), "\\end{solution}");
      } else if (env === "problem" && space > 0) {
        body.push(`\\par\\vspace*{${space}cm}`);
      }
      body.push(`\\end{${env}}`, "");
    }
    return body.join("\n");
  };
  const knownScores = questions.map(q => q.points ?? score(q.problem));
  const total = knownScores.every(s => s !== undefined) && !questions.some(q => questionType(q.problem) === "选考题")
    ? `，满分 ${knownScores.reduce((a, b) => a! + b!, 0)} 分` : "";
  const document = (answers: boolean) => String.raw`% Generated by Moti. Compile with XeLaTeX, without shell escape.
% exam-zh upstream: https://github.com/xkwxdyy/exam-zh
% Revision: ${EXAM_ZH_REVISION}
\documentclass[fontset=fandol,zihao=-4,oneside]{exam-zh}
\usepackage{graphicx}
\usepackage{needspace}
\examsetup{
  page/size=a4paper,
  page/foot-content={数学${answers ? "解析" : "试题"}第;页（共;页）},
  font=termes, math-font=termes,
  question/show-points=true,
  question/top-sep=0.8em, question/bottom-sep=0.8em,
  problem/show-points=true, problem/points-separate-par=false,
  problem/top-sep=1em, problem/bottom-sep=1em,
  solution/show-solution=show-stay, solution/label-indentation=false, solution/label-content={},
  choices/columns=0,
  sealline/show=false
}
\AtEndPreamble{\geometry{a4paper,left=22mm,right=22mm,top=20mm,bottom=22mm}}
\providecommand{\bm}[1]{\symbf{#1}}
\providecommand{\boldsymbol}[1]{\symbf{#1}}
% Keep long source formulas inside the printable area without changing them.
\newsavebox{\MotiMathBox}
\newcommand{\MotiDisplay}[1]{\begingroup
  \sbox{\MotiMathBox}{$\displaystyle #1$}%
  \[\ifdim\wd\MotiMathBox>\linewidth
    \resizebox{\linewidth}{!}{\usebox{\MotiMathBox}}%
  \else\usebox{\MotiMathBox}\fi\]\endgroup}
\newcommand{\MotiInline}[1]{\leavevmode\allowbreak\begingroup
  \sbox{\MotiMathBox}{$#1$}%
  \ifdim\wd\MotiMathBox>0.92\linewidth
    \resizebox{0.92\linewidth}{!}{\usebox{\MotiMathBox}}%
  \else $#1$\fi\endgroup}
% Keep ordinary option groups together; oversized groups may still paginate.
\newsavebox{\MotiChoicesBox}
\NewDocumentEnvironment{MotiChoices}{+b}{\par\begingroup
  \sbox{\MotiChoicesBox}{\begin{minipage}{\linewidth}\begin{choices}#1\end{choices}\end{minipage}}%
  \ifdim\dimexpr\ht\MotiChoicesBox+\dp\MotiChoicesBox\relax>0.85\textheight
    \begin{choices}#1\end{choices}%
  \else
    \Needspace{\dimexpr\ht\MotiChoicesBox+\dp\MotiChoicesBox+\baselineskip\relax}%
    \noindent\usebox{\MotiChoicesBox}\par
  \fi\endgroup}{}
\setlength{\emergencystretch}{2em}
\allowdisplaybreaks[1]
\raggedbottom
\title{${escapeLatexText(options.title.trim() || "高考数学组卷")}}
\subject{${answers ? "参考答案与解析" : "数学"}}
\begin{document}
\maketitle
\begin{center}
共 ${questions.length} 题${total}${minutes ? `，考试时间 ${minutes} 分钟` : ""}。
\end{center}
${answers ? "" : String.raw`\begin{center}姓名\underline{\hspace{3cm}}\quad 班级\underline{\hspace{2.5cm}}\quad 考号\underline{\hspace{3cm}}\end{center}`}
${makeBody(answers)}
\end{document}
`;
  const student = document(false);
  const teacher = options.withAnswers ? document(true) : undefined;
  return { student, teacher, assets, warnings: [...warnings] };
}
