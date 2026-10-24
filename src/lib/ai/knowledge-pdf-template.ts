import type { KnowledgeReport, KnowledgeSource } from "./knowledge-schema";
import { knowledgeLabels, knowledgeSourceName, representativeSource } from "./knowledge-schema.ts";
import { splitInlineFigures } from "../problems/inline-figures.ts";
import { assertMathTexSafe } from "../paper/math-tex-safety.ts";

export function knowledgeFigureAssets(report: KnowledgeReport) {
  return report.sources.flatMap((s, i) => (s.figures || []).map((f, j) => {
    const type = /^data:image\/(png|jpeg);base64,/.exec(f.image || "")?.[1];
    if (!type) throw new Error(`“${knowledgeSourceName(s)}”有无法排版的配图，请先在题库保存 PNG 或 JPEG 配图。`);
    return { path: `source-${i}-figure-${j}.${type === "png" ? "png" : "jpg"}`, image: f.image! };
  }));
}

function sourceProblemTex(report: KnowledgeReport, source: KnowledgeSource): string {
  const i = report.sources.findIndex(s => s.id === source.id);
  const figures = source.figures || [];
  const figure = (id: string) => {
    const j = figures.findIndex(f => f.id === id), f = figures[j];
    if (!f) throw new Error(`“${knowledgeSourceName(source)}”缺少题干引用的配图。`);
    const ext = f.image?.startsWith("data:image/png;") ? "png" : "jpg";
    return `\\par\\begin{center}\\includegraphics[width=0.75\\linewidth,height=52mm,keepaspectratio]{source-${i}-figure-${j}.${ext}}${f.subproblem ? `\\par{\\footnotesize 第${f.subproblem}小问配图}` : ""}\\end{center}\\par`;
  };
  const parts = splitInlineFigures(source.stem || "此笔记未保存原题快照，请回到题库核对。");
  const inlineIds = new Set(parts.flatMap(p => p.type === "figure" ? [p.id] : []));
  return parts.map(p => p.type === "text" ? noteTextToTex(p.value) : figure(p.id)).join("")
    + figures.filter(f => !f.inline && !inlineIds.has(f.id)).map(f => figure(f.id)).join("\n");
}

// A single problem follows its reasoning, rather than the lecture's method catalogue.
function buildSingleBody(report: KnowledgeReport, stale: boolean): string {
  const c = report.content, t = noteTextToTex;
  const head = (n: string, title: string, sub: string) => `\\pagehead{${n}}{${t(title)}}{${t(sub)}}`;
  const field = (label: string, value: string) => `\\Needspace{4\\baselineskip}\\fieldlabel{${label}}${t(value)}\\par`;
  const list = (items: string[]) => `\\begin{enumerate}[leftmargin=1.7em,itemsep=4pt,topsep=3pt]${items.map(v => `\\item ${t(v)}`).join("\n")}\\end{enumerate}`;
  const box = (body: string) => `\\begin{notebox}[colback=tint,colframe=tint]${body}\\end{notebox}`;
  return head("PROBLEM NOTES / 单题思路复盘", c.title, "01 看见线索  /  02 复原推理  /  03 迁移到新题") + `
${box(field("这一题，带走什么", c.takeaway))}
${report.sources.map((s, i) => `\\hypertarget{source${i}}{}\\fieldlabel{原题}${sourceProblemTex(report, s)}\\par{\\footnotesize\\href{http://127.0.0.1:8080/p/${encodeURIComponent(s.id)}}{查看原题：${t(knowledgeSourceName(s))}}}\\par`).join("\n")}
${stale ? box("原题或题目范围已变化，请结合最新题目核对。") : ""}
${c.uncertainties.length ? box(field("先核对条件", c.uncertainties.join("\n"))) : ""}
\\fieldlabel{本题用到的知识}
${c.concepts.map(v => field(t(v.title), v.explanation)).join("\n")}
${c.methods.map(v => box(field("题面线索", v.signal) + field("突破口：为什么想到这一步", v.idea))).join("\n")}
\\clearpage
${head("02 / REASONING", "把关键一步想明白", "每一步既写怎么做，也说明为什么可以这样做。")}
${c.methods.map((v, i) => `\\Needspace{35mm}\\fieldlabel{${i + 1}. ${t(v.title)}}${list(v.steps)}${box(field("关键变形与结果", v.example))}${field("卡点与易错原因", v.pitfalls)}\\par{\\footnotesize\\hyperlink{source0}{回看原题}}`).join("\n")}
\\begingroup\\fontsize{10}{14}\\selectfont
${field("下次遇到类似题", "")}${list(c.checklist)}
\\endgroup
\\clearpage
${head("03 / TRANSFER", "下一题，自己会想到吗", "先遮住参考答案，解释理由，再核对适用条件。")}
\\fieldlabel{变式与迁移自测}
${c.selfChecks.map((v, i) => `\\Needspace{20mm}${field(`自测 ${i + 1}`, v.question)}`).join("\n")}
\\vspace{4mm}{\\color{line}\\hrule}\\vspace{2mm}
\\fieldlabel{参考答案 / 先想再看}
${c.selfChecks.map((v, i) => field(`${i + 1}`, v.answer)).join("\n")}
${box(field("本题方法卡", c.coverage.map(v => v.takeaway).join("\n")))}
\\ifdim\\dimexpr\\pagegoal-\\pagetotal\\relax>22mm\\vfill\\notelines{我的复盘：哪条条件变化，会改变解题方法？}{2}\\fi
\\par{\\footnotesize\\color{muted}单题笔记独立保存。AI 归纳，请结合原题核对。}
\\end{document}`;
}

export function escapeNoteText(text: string): string {
  const map: Record<string, string> = { "\\": "\\textbackslash{}", "&": "\\&", "%": "\\%", "$": "\\$", "#": "\\#", "_": "\\_", "{": "\\{", "}": "\\}", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}" };
  return text.replace(/[\\&%$#_{}~^]/g, (c) => map[c]);
}

export function noteTextToTex(text: string): string {
  const re = /(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$|(?<!\\)\$([^$]*?)(?<!\\)\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;
  let cursor = 0, output = "";
  const prose = (s: string) => escapeNoteText(s.replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, c => `（${"①②③④⑤⑥⑦⑧⑨⑩".indexOf(c) + 1}）`).replace(/[—–‑]/g, "-")).replace(/\r?\n/g, "\n\\par ");
  for (const match of text.matchAll(re)) {
    output += prose(text.slice(cursor, match.index));
    const math = match[1] ?? match[2] ?? match[3] ?? match[4];
    assertMathTexSafe(math);
    output += match[1] !== undefined || match[3] !== undefined ? `\\NoteDisplay{${math}}` : `\\NoteInline{${math}}`;
    cursor = match.index! + match[0].length;
  }
  return output + prose(text.slice(cursor));
}

export function buildKnowledgeLatex(report: KnowledgeReport, stale = false): string {
  const c = report.content;
  const labels = knowledgeLabels(report.kind);
  const text = noteTextToTex;
  const names = new Map(report.sources.map((p, i) => [p.id, p.label ? knowledgeSourceName(p) : `${String(i + 1).padStart(2, "0")} · ${p.title}`]));
  const refs = (ids: string[]) => `\\par{\\footnotesize\\color{muted}完整原题：${ids.map((id) => { const i = report.sources.findIndex(p => p.id === id); return `\\hyperlink{source${i}}{${escapeNoteText(names.get(id) || id)}（第\\pageref*{source${i}}页）}`; }).join("；")}\\par}`;
  const heading = (kicker: string, title: string, subtitle: string) => `\\pagehead{${escapeNoteText(kicker)}}{${text(title)}}{${text(subtitle)}}`;
  const field = (label: string, value: string) => `\\Needspace{4\\baselineskip}\\fieldlabel{${label}}\n${text(value)}\\par\n`;
  const list = (items: string[]) => `\\begin{enumerate}[leftmargin=1.65em,label=\\textcolor{accent}{\\arabic*.},itemsep=3pt,parsep=0pt,topsep=3pt]\n${items.map((v) => `\\item ${text(v)}`).join("\n")}\n\\end{enumerate}`;
  const date = new Date(report.generatedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
  const methods = c.methods.map((m, i) => `
\\clearpage
\\hypertarget{method${i}}{}\\label{method${i}}
${heading(`METHOD ${String(i + 1).padStart(2, "0")} / ${String(c.methods.length).padStart(2, "0")}`, m.title, "认出特征，理解转化，再把方法用到新题里。")}
\\begin{notebox}[colback=tint,colframe=tint]
${field(labels.signal, m.signal)}
${field(labels.idea, m.idea)}
\\end{notebox}
\\fieldlabel{${labels.steps}}
${list(m.steps)}
${(() => { const s = representativeSource(report, m); return s ? `\\begin{notebox}[colback=white,colframe=line]\n\\fieldlabel{对照原题 / ${text(knowledgeSourceName(s))}}\n${sourceProblemTex(report, s)}\n\\end{notebox}` : ""; })()}
\\begin{notebox}[colback=paper,colframe=line,borderline west={1.5pt}{0pt}{accent}]
${field(labels.example, m.example)}
\\end{notebox}
${field(labels.pitfalls, m.pitfalls)}
${refs(m.problemIds)}
\\ifdim\\dimexpr\\pagegoal-\\pagetotal\\relax>22mm\\vfill\\notelines{我的理解 / 下次怎样认出它}{2}\\fi
`).join("\n");
  const preamble = String.raw`\documentclass[UTF8,fontset=fandol,zihao=-4]{ctexart}
\usepackage[a4paper,left=22mm,right=22mm,top=20mm,bottom=20mm,headheight=14pt,headsep=6mm,footskip=10mm]{geometry}
\usepackage{amsmath,amssymb,bm,graphicx,xcolor,enumitem,needspace,fancyhdr}
\usepackage[most]{tcolorbox}
\usepackage[unicode,hidelinks]{hyperref}
\definecolor{ink}{HTML}{253C38}
\definecolor{accent}{HTML}{237767}
\definecolor{muted}{HTML}{64736C}
\definecolor{tint}{HTML}{EDF5F1}
\definecolor{paper}{HTML}{FAFAF6}
\definecolor{line}{HTML}{DCE5DE}
\definecolor{gold}{HTML}{9C7333}
\color{ink}
\setlength{\parindent}{0pt}
\setlength{\parskip}{4pt}
\linespread{1.2}
\setlength{\emergencystretch}{3em}
\raggedbottom
\pagestyle{fancy}\fancyhf{}
\fancyhead[L]{\footnotesize\sffamily\color{accent}解集 / 知识沉淀}
\fancyhead[R]{\footnotesize\color{muted}数学方法笔记}
\fancyfoot[L]{\scriptsize\color{muted}理解 · 迁移 · 复盘}
\fancyfoot[R]{\footnotesize\color{accent}\thepage}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\headrule}{\color{line}\hrule width\headwidth height\headrulewidth}
\newcommand{\pagehead}[3]{{\small\sffamily\color{accent}#1}\par\vspace{3mm}{\sffamily\bfseries\fontsize{23}{30}\selectfont #2}\par\vspace{2mm}{\small\color{muted}#3}\par\vspace{4mm}}
\newcommand{\fieldlabel}[1]{\par\vspace{1.5mm}{\sffamily\bfseries\small\color{accent}#1}\par\nobreak}
\newtcolorbox{notebox}[1][]{enhanced,breakable,boxrule=0.4pt,arc=2mm,left=4mm,right=4mm,top=2mm,bottom=3mm,before skip=3mm,after skip=3mm,colback=white,colframe=line,#1}
\newcommand{\notelines}[2]{\par\vspace{2mm}{\footnotesize\sffamily\color{muted}#1}\par\foreach \i in {1,...,#2}{\vspace{5mm}{\color{line}\hrule}\vspace{1mm}}}
\newsavebox{\NoteMath}
\newcommand{\NoteInline}[1]{\leavevmode\allowbreak\begingroup\sbox{\NoteMath}{$#1$}\ifdim\wd\NoteMath>0.94\linewidth\resizebox{0.94\linewidth}{!}{\usebox{\NoteMath}}\else$#1$\fi\endgroup}
\newcommand{\NoteDisplay}[1]{\par\vspace{3pt}\begingroup\centering\sbox{\NoteMath}{$\displaystyle #1$}\ifdim\wd\NoteMath>0.98\linewidth\resizebox{0.98\linewidth}{!}{\usebox{\NoteMath}}\else\usebox{\NoteMath}\fi\par\endgroup\vspace{3pt}}
\hypersetup{pdftitle={知识沉淀},pdfauthor={解集}}
\begin{document}
\fontsize{11}{16}\selectfont
`;
  if (report.kind === "single") return preamble.replace("{237767}", "{32638A}").replace("{EDF5F1}", "{EDF3F9}") + buildSingleBody(report, stale);
  return preamble + heading(`STUDY MAP / ${labels.name}`, c.title.replace(/[:：]可复用知识沉淀$/, ""), `${report.sources.length}道原题 · ${c.concepts.length}项核心知识 · ${c.methods.length}类解题方法 · ${c.selfChecks.length}个自测 / ${date}`) + `
\\begin{notebox}[colback=tint,colframe=tint]
${field(labels.takeaway, c.takeaway)}
\\end{notebox}
\\fieldlabel{方法索引}
${list(c.methods.map((m) => m.title))}
\\fieldlabel{怎样用这份笔记}
方法卡配有完整题干，可对照阅读推导。其余关联题见文末完整原题附录；点击题名可跳转，附录可返回对应方法页。
${stale ? "\\begin{notebox}[colframe=gold]原题或题目范围已变化。这份 PDF 导出的是上次保存的笔记，请结合最新题目核对。\\end{notebox}" : ""}
${c.uncertainties.length ? `\\begin{notebox}[colback=paper,colframe=line]\n${field("阅读前，先核对", c.uncertainties.join("\n\n"))}\n\\end{notebox}` : ""}
\\vfill{\\footnotesize\\color{muted}基于原题整理的复习笔记。AI 归纳内容请结合原题核对；个人修订以当前保存版本为准。}
\\clearpage
${heading("ROUTE / 方法选择", labels.checklist, "先判断条件，再选工具；同一道题可能有多条路线。")}
${list(c.checklist)}
\\vfill\\notelines{我的选法依据 / 什么条件会让我换一种方法？}{3}
\\clearpage
${heading("01 / FOUNDATIONS", "核心知识", "记住结论，也记住它成立的条件。")}
${c.concepts.map((v, i) => `\\Needspace{35mm}\\fieldlabel{${String(i + 1).padStart(2, "0")} / ${text(v.title)}}\n${text(v.explanation)}\n${refs(v.problemIds)}\n\\vspace{2mm}{\\color{line}\\hrule}\n`).join("\n")}
${methods}
\\clearpage
${heading("03 / ACTIVE RECALL", labels.selfChecks, "先说清为什么选这种方法，参考答案在后一页。")}
${c.selfChecks.map((v, i) => `\\Needspace{30mm}\\fieldlabel{自测 ${i + 1}}\n${text(v.question)}\n\\notelines{关键理由}{1}\n\\vspace{2mm}`).join("\n")}
\\clearpage
${heading("04 / ANSWER KEY", "自测参考答案", "核对推理的关键条件，而不仅是最后一句话。")}
${c.selfChecks.map((v, i) => `\\Needspace{30mm}\\fieldlabel{自测 ${i + 1}}\n${text(v.answer)}\\par\\vspace{3mm}{\\color{line}\\hrule}\n`).join("\n")}
\\vfill\\notelines{还没讲清楚的地方}{3}
${Array.from({ length: Math.ceil(report.sources.length / 3) }, (_, chunk) => `\\clearpage\n${heading("05 / ORIGINAL PROBLEMS", chunk ? "完整原题 · 续" : "完整原题与方法索引", "按原题顺序保留题干、选项和小问。点击方法名称可返回方法页。")}
${report.sources.slice(chunk * 3, chunk * 3 + 3).map(s => {
  const i = report.sources.findIndex(p => p.id === s.id);
  return `\\Needspace{45mm}\\hypertarget{source${i}}{}\\label{source${i}}\\begin{notebox}[colback=white,colframe=line]
\\fieldlabel{${text(names.get(s.id) || s.title)}}
${sourceProblemTex(report, s)}\\par
${field("方法收获", c.coverage.find(v => v.problemId === s.id)?.takeaway || "")}
{\\footnotesize\\color{accent}${c.methods.flatMap((m, n) => m.problemIds.includes(s.id) ? [`\\hyperlink{method${n}}{返回方法 ${n + 1}（第\\pageref*{method${n}}页）}`] : []).join("；")}\\par
\\href{http://127.0.0.1:8080/p/${encodeURIComponent(s.id)}}{在本机题库打开原题}}\\end{notebox}`;
}).join("\n")}
\\ifdim\\dimexpr\\pagegoal-\\pagetotal\\relax>22mm\\vfill\\notelines{值得再做一遍的题目}{2}\\fi`).join("\n")}
\\end{document}
`;
}
