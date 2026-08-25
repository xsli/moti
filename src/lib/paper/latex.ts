import type { ExamItem } from "./layout";
import { answerHeightCm } from "./space";

function escapeTex(text: string): string {
  return text.replace(/[\\&%$#_{}~^]/g, (ch) => {
    const map: Record<string, string> = {
      "\\": "\\textbackslash{}",
      "&": "\\&",
      "%": "\\%",
      $: "\\$",
      "#": "\\#",
      _: "\\_",
      "{": "\\{",
      "}": "\\}",
      "~": "\\textasciitilde{}",
      "^": "\\textasciicircum{}",
    };
    return map[ch] ?? ch;
  });
}

function toTex(input: string): string {
  const parts: string[] = [];
  let i = 0;
  while (i < input.length) {
    if (input.startsWith("$$", i)) {
      const end = input.indexOf("$$", i + 2);
      if (end === -1) {
        parts.push(escapeTex(input.slice(i)));
        break;
      }
      parts.push(`\\[\n${input.slice(i + 2, end).trim()}\n\\]`);
      i = end + 2;
      continue;
    }
    if (input[i] === "$") {
      const end = input.indexOf("$", i + 1);
      if (end === -1) {
        parts.push(escapeTex(input.slice(i)));
        break;
      }
      parts.push(`$${input.slice(i + 1, end)}$`);
      i = end + 1;
      continue;
    }
    const next = input.indexOf("$", i);
    const chunk = next === -1 ? input.slice(i) : input.slice(i, next);
    parts.push(escapeTex(chunk).replace(/\n/g, "\\\\\n"));
    i = next === -1 ? input.length : next;
  }
  return parts.join("");
}

export function buildExamLatex(
  items: ExamItem[],
  options: { title: string; dateLabel: string; withAnswers: boolean },
): string {
  const problems = items.filter((item): item is Extract<ExamItem, { kind: "problem" }> => item.kind === "problem");
  const body = items
    .map((item) => {
      if (item.kind === "heading") {
        return `\\par\\addvspace{1.1em}\\noindent{\\bfseries\\large ${escapeTex(item.title)}}\\par\\addvspace{0.4em}`;
      }
      const p = item.problem;
      const fig = p.figures.some((f) => f.image || f.svg)
        ? `
\\begin{center}
\\fbox{\\parbox{0.55\\textwidth}{\\centering\\vspace{1.6cm}\\small 本题附图见导出的 PDF\\vspace{1.6cm}}}
\\end{center}`
        : "";
      return `\\begin{question}
${toTex(p.stem)}
${fig}
\\answerbox{${answerHeightCm(p)}}
\\end{question}`;
    })
    .join("\n\n");

  const answers = options.withAnswers
    ? `
\\clearpage
\\thispagestyle{plain}
\\begin{center}{\\Large\\bfseries 参考答案}\\end{center}
\\vspace{0.6em}
\\begin{enumerate}[leftmargin=1.7em,itemsep=0.7em]
${problems
  .map((item) => {
    return `\\item ${toTex(item.problem.correctAnswer || "（略）")}
\\par\\vspace{0.25em}
${toTex(item.problem.analysis || "")}`;
  })
  .join("\n")}
\\end{enumerate}
`
    : "";

  return `% !TEX program = xelatex
% 墨题试卷 · A4 · 用 XeLaTeX 编译
\\documentclass[a4paper,11pt]{ctexart}
\\usepackage[a4paper,left=1.9cm,right=1.9cm,top=2.1cm,bottom=1.8cm]{geometry}
\\usepackage{amsmath,amssymb,amsfonts,bm}
\\usepackage{setspace,fancyhdr,enumitem,graphicx,array,booktabs,xcolor}
\\setstretch{1.28}
\\pagestyle{fancy}
\\fancyhf{}
\\lhead{\\small ${escapeTex(options.title)}}
\\rhead{\\small 第\\,\\thepage\\,页}
\\renewcommand{\\headrulewidth}{0.4pt}
\\setlength{\\parindent}{0em}
\\setlist[enumerate]{leftmargin=1.7em,itemsep=0.55em,topsep=0.3em}
\\newcounter{qnum}
\\newenvironment{question}{%
  \\par\\addvspace{0.95em}%
  \\refstepcounter{qnum}%
  \\noindent\\hangindent=1.75em\\hangafter=1
  {\\bfseries\\theqnum.}\\hspace{0.45em}\\ignorespaces
}{\\par}
\\newcommand{\\answerbox}[1]{%
  \\par\\vspace{0.45em}%
  \\noindent\\fbox{%
    \\begin{minipage}[t][#1]{\\dimexpr\\linewidth-2\\fboxsep-2\\fboxrule}
    \\end{minipage}}%
  \\par\\vspace{0.55em}%
}
\\begin{document}
\\thispagestyle{plain}
\\begin{center}
  {\\small 墨题}\\\\[0.35em]
  {\\LARGE\\bfseries ${escapeTex(options.title)}}\\\\[0.45em]
  {\\small ${escapeTex(options.dateLabel)}}
\\end{center}
\\vspace{0.7em}
\\noindent 姓名\\underline{\\hspace{3.0cm}}\\hfill
班级\\underline{\\hspace{2.4cm}}\\hfill
学号\\underline{\\hspace{2.4cm}}\\hfill
得分\\underline{\\hspace{2.0cm}}
\\vspace{0.45em}
\\noindent\\rule{\\linewidth}{0.8pt}
\\vspace{0.8em}
\\vspace{0.3em}

${body}
${answers}
\\end{document}
`;
}
