import { chineseOrdinal, type ExamItem } from "./layout";
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

function scoreTableTex(headingCount: number): string {
  const n = Math.max(1, headingCount);
  const labels = Array.from({ length: n }, (_, i) => chineseOrdinal(i + 1));
  const spec = `|c|*{${n}}{c}|c|`;
  return `\\begin{center}
\\begin{tabular}{${spec}}
\\hline
题号 & ${labels.join(" & ")} & 课程考核成绩 \\\\
\\hline
得分 & ${labels.map(() => "\\hspace{1.6em}").join(" & ")} & \\\\
\\hline
\\end{tabular}
\\end{center}`;
}

export function buildExamLatex(
  items: ExamItem[],
  options: { title: string; dateLabel: string; withAnswers: boolean },
): string {
  const headingCount = items.filter((item) => item.kind === "heading").length;
  const body = items
    .map((item) => {
      if (item.kind === "heading") {
        return `\\par\\addvspace{1.0em}
\\noindent
{\\setlength{\\tabcolsep}{4pt}\\begin{tabular}{|c|}
\\hline 得分 \\\\ \\hline \\rule{0pt}{1.15em} \\\\ \\hline
\\end{tabular}}\\hspace{0.7em}{\\bfseries ${escapeTex(item.title)}}
\\par\\addvspace{0.45em}`;
      }
      const p = item.problem;
      const fig = p.figures.some((f) => f.image || f.svg)
        ? `
\\begin{center}
\\fbox{\\parbox{0.55\\textwidth}{\\centering\\vspace{1.6cm}\\small 本题附图见导出的 PDF\\vspace{1.6cm}}}
\\end{center}`
        : "";
      const space = options.withAnswers
        ? ""
        : `\\par\\vspace{${answerHeightCm(p)}}`;
      const analysis = options.withAnswers
        ? `
{\\color{blue}{\\heiti 解析}\\quad ${toTex(p.correctAnswer || "（略）")}
\\par ${toTex(p.analysis || "")}}`
        : "";
      return `\\begin{question}
${toTex(p.stem)}
${fig}
${space}
${analysis}
\\end{question}`;
    })
    .join("\n\n");

  return `% !TEX program = xelatex
% 墨题试卷 · 版式参考 USTBExam / exam-zh
\\documentclass[a4paper,11pt]{ctexart}
\\usepackage[a4paper,inner=3.3cm,outer=2.03cm,top=2.54cm,bottom=2.54cm]{geometry}
\\usepackage{amsmath,amssymb,amsfonts,bm}
\\usepackage{setspace,fancyhdr,enumitem,graphicx,array,makecell,xcolor}
\\setstretch{1.28}
\\pagestyle{fancy}
\\fancyhf{}
\\cfoot{\\small ${escapeTex(options.title)}\\quad 第\\,\\thepage\\,页}
\\renewcommand{\\headrulewidth}{0pt}
\\setlength{\\parindent}{0em}
\\setlist[enumerate]{leftmargin=1.7em,itemsep=0.55em,topsep=0.3em}
\\newcounter{qnum}
\\newenvironment{question}{%
  \\par\\addvspace{0.95em}%
  \\refstepcounter{qnum}%
  \\noindent\\hangindent=1.75em\\hangafter=1
  {\\bfseries\\theqnum.}\\hspace{0.45em}\\ignorespaces
}{\\par}
\\newcommand{\\answerbox}[1]{\\par\\vspace*{#1}\\par}
\\begin{document}
\\thispagestyle{fancy}
\\begin{center}
  {\\heiti\\LARGE 墨题\\quad ${escapeTex(options.dateLabel)}}\\\\[0.55em]
  {\\heiti\\LARGE \\underline{\\quad ${escapeTex(options.title)}\\quad}${options.withAnswers ? "{\\normalsize\\color{blue}\\fbox{\\strut 解析}}" : ""}}
\\end{center}
\\vspace{0.6em}
\\noindent 姓名\\hrulefill\\,\\hfill
班级\\hrulefill\\,\\hfill
学号\\hrulefill\\,\\hfill
得分\\hrulefill
\\vspace{0.5em}
${scoreTableTex(headingCount)}
\\vspace{0.4em}

${body}
\\end{document}
`;
}
