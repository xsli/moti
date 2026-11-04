import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { PDFDocument } from "pdf-lib";
import { HandoutSheet } from "@/components/paper/handout-sheet";
import { getProblemFn } from "@/lib/problems/api";
import { appendBookPdfPage } from "@/lib/paper/pdf";
import type { ExamItem } from "@/lib/paper/layout";
import type { Collection } from "@/lib/problems/collections";
import type { Problem } from "@/lib/problems/types";
import { getExamAnalysis } from "./api";
import {
  distribution,
  linkedProblem,
  exportRows,
  RELATION_LABEL,
  type ExamAnalysis,
} from "./model";

export async function exportExamAnalysis(
  report: ExamAnalysis,
  title: string,
  problems: Problem[],
  collections: Collection[],
  signal: AbortSignal,
  progress: (text: string) => void,
  includeSupport = false,
  originalIds?: string[],
) {
  const current = await getExamAnalysis({ data: { collectionId: report.collectionId } });
  if (
    current.report?.revision !== report.revision ||
    current.scopeChanged ||
    current.staleIds.length
  )
    throw new Error("题目或分析已变化，请刷新并核对后导出。");
  const groups = exportRows(report.rows, includeSupport, originalIds),
    ids = [...new Set(groups.flatMap((r) => [r.problemId, ...r.links.map((l) => l.problemId)]))],
    full = new Map<string, Problem>();
  for (const [i, id] of ids.entries()) {
    signal.throwIfAborted();
    progress(`读取完整题目和配图 ${i + 1}/${ids.length}`);
    const p = await getProblemFn({ data: { id } });
    if (!p) throw new Error("有题目已删除，请刷新。");
    full.set(id, { ...p, sourceImage: undefined });
  }
  const cs = new Map(collections.map((c) => [c.id, c])),
    items: ExamItem[] = [];
  let number = 0;
  for (const row of groups) {
    const i = report.rows.findIndex((original) => original.problemId === row.problemId);
    items.push({
      kind: "heading",
      title: `对应原卷第 ${i + 1} 题 · ${row.topic || "关联练习"}`,
      role: "practice",
    });
    items.push({
      kind: "problem",
      problem: full.get(row.problemId)!,
      number: i + 1,
      label: String(i + 1),
      role: "example",
      blankLines: 6,
    });
    for (const link of row.links) {
      const p = linkedProblem(full.get(link.problemId)!, link),
        c = cs.get(p.collectionId || "");
      number++;
      const source = `${c?.groupName || ""} · ${c?.name || "未分组"} · ${p.title}`;
      items.push({
        kind: "problem",
        problem: {
          ...p,
          analysis: `${p.analysis}\n\n${p.analysis.includes("收录位置：") ? "" : `收录位置：${source}。\n`}与原卷第 ${i + 1} 题：${RELATION_LABEL[link.relation]}。${link.reason}\n差异：${link.difference}`,
        },
        number,
        label: String(number),
        role: "practice",
        blankLines: 6,
      });
    }
  }
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-12000px;top:0;width:794px;background:white;pointer-events:none";
  host.setAttribute("aria-hidden", "true");
  document.body.append(host);
  // html2canvas otherwise clones the whole reading page and every other PDF page
  // for each capture. Excluding them keeps long exports bounded in time and memory.
  const ignored = [...document.body.children]
    .filter((el) => el !== host)
    .map((el) => ({ el, value: el.getAttribute("data-html2canvas-ignore") }));
  ignored.forEach(({ el }) => el.setAttribute("data-html2canvas-ignore", "true"));
  const root = createRoot(host),
    pdf = await PDFDocument.create();
  pdf.setTitle(`${title} · 原题与关联练习`);
  const render = (node: React.ReactNode) =>
    new Promise<void>((resolve) => {
      // The export host is a separate concurrent root. Frames alone do not
      // guarantee React has committed its first page before canvas capture.
      flushSync(() => root.render(node));
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  try {
    progress("生成分析总览…");
    const chapters = distribution(report, problems, collections);
    await render(
      <div
        style={{
          width: 794,
          height: 1123,
          padding: 65,
          boxSizing: "border-box",
          background: "white",
          color: "#193c33",
          fontFamily: "HandoutSourceHan,SimSun,serif",
        }}
      >
        <p style={{ color: "#008675", fontSize: 16 }}>解集 · 试卷分析与针对性练习</p>
        <h1 style={{ fontSize: 26, lineHeight: 1.5, marginTop: 32 }}>{title}</h1>
        <p style={{ fontSize: 16, margin: "25px 0" }}>
          {groups.length} 道原题 ＋ {number} 道去重练习 · 答案解析在卷末
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.8 }}>
          每组先做橙色标注的原题，再做关联练习。关联材料表示题库收录位置，不代表确定的命题出处。以下分布按全部已关联题目统计，补充训练不计入针对性得分。
        </p>
        <h2 style={{ fontSize: 19, marginTop: 28 }}>优先练习讲次</h2>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">讲次</th>
              <th>关联单元</th>
              <th>覆盖原卷题号</th>
            </tr>
          </thead>
          <tbody>
            {chapters.slice(0, 10).map((c) => (
              <tr key={c.id}>
                <td style={{ padding: "9px 0", borderBottom: "1px solid #ddd", maxWidth: 350 }}>
                  {c.group}
                  <br />
                  {c.name}
                </td>
                <td align="center">{c.count}</td>
                <td align="center">{c.coverage.join("、") || "补充"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 11, lineHeight: 1.7, marginTop: 20 }}>
          同题重复收录仅保留一份练习。涉及小问时按所选范围呈现；部分旧解析无法拆分时明确标注完整解析。图片中的原资料编号以本卷题号为准。
        </p>
      </div>,
    );
    await appendBookPdfPage(pdf, host.firstElementChild as HTMLElement, { signal, dpi: 180 });
    progress("排版原题、关联题及卷末解析…");
    await new Promise<void>((resolve, reject) =>
      root.render(
        <>
          <style>{`.handout-sheet .hn-example{padding-left:19mm!important}.handout-sheet .hn-example-no{width:16mm!important;font:9pt HandoutSourceHan!important}.handout-sheet .hn-answer-heading.hn-example{padding-left:0!important}.handout-sheet .hn-answer-heading>.hn-question-heading{display:none}.handout-sheet .exam-figure img,.handout-sheet .exam-figure svg{max-height:60mm!important}.handout-sheet .hn-sec-title{font-size:13pt!important}.handout-sheet .hn-title h1{font-size:18pt!important}`}</style>
          <HandoutSheet
            title={title}
            items={items}
            withAnswers
            answerPlacement="end"
            quotes={[{ text: "原题与关联练习", person: "解集" }]}
            onReady={resolve}
            onError={(e) => reject(new Error(e))}
          />
        </>,
      ),
    );
    if (host.querySelector(".exam-pack .katex-error"))
      throw new Error("存在无法渲染的公式，请修正后再导出。");
    // HandoutSheet numbers examples consecutively. Restore the source exam numbers
    // after pagination so a subset such as questions 2 and 5 keeps those labels.
    const originalNumbers = groups.map(
      (row) => report.rows.findIndex((r) => r.problemId === row.problemId) + 1,
    );
    for (const badge of host.querySelectorAll(
      ".exam-pack .hn-example:not(.hn-answer-heading) .hn-example-no",
    ))
      badge.textContent = `原题 ${originalNumbers[Number(badge.textContent?.trim()) - 1] ?? badge.textContent}`;
    for (const label of host.querySelectorAll(".exam-pack .hn-answer-heading.hn-example > span"))
      label.textContent =
        label.textContent?.replace(
          /例题\s*(\d+)/,
          (_, n) => `原卷第 ${originalNumbers[Number(n) - 1] ?? n} 题`,
        ) || "";
    const pages = [...host.querySelectorAll<HTMLElement>(".exam-pack .exam-page")];
    host.querySelector(".exam-measure")?.setAttribute("data-html2canvas-ignore", "true");
    pages.forEach((page) => page.setAttribute("data-html2canvas-ignore", "true"));
    for (const [i, page] of pages.entries()) {
      page.removeAttribute("data-html2canvas-ignore");
      signal.throwIfAborted();
      const folio = page.querySelector(".hn-folio");
      if (folio) folio.textContent = String(i + 2);
      progress(`生成 PDF ${i + 2}/${pages.length + 1} 页`);
      await appendBookPdfPage(pdf, page, { signal, dpi: 180 });
      page.setAttribute("data-html2canvas-ignore", "true");
    }
    const check = await getExamAnalysis({ data: { collectionId: report.collectionId } });
    if (check.report?.revision !== report.revision || check.staleIds.length || check.scopeChanged)
      throw new Error("导出期间题目或分析变化，请刷新重试。");
    return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
  } finally {
    root.unmount();
    host.remove();
    ignored.forEach(({ el, value }) => {
      if (value === null) el.removeAttribute("data-html2canvas-ignore");
      else el.setAttribute("data-html2canvas-ignore", value);
    });
  }
}
