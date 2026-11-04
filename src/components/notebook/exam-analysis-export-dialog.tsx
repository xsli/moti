import { useMemo, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MathText } from "@/lib/problems/math-text";
import type { Problem } from "@/lib/problems/types";
import {
  exportRows,
  linkKey,
  RELATION_LABEL,
  type AnalysisLink,
  type ExamAnalysis,
} from "@/lib/exam-analysis/model";

const choiceKey = (originalId: string, link: AnalysisLink) => `${originalId}/${linkKey(link)}`;

export function ExamAnalysisExportDialog({
  report,
  problems,
  source,
  busy,
  error,
  onClose,
  onExport,
  onCancel,
}: {
  report: ExamAnalysis;
  problems: Problem[];
  source: (id: string) => string;
  busy: string;
  error: string;
  onClose: () => void;
  onExport: (
    selection: ExamAnalysis,
    originalIds: string[],
    includeSupport: boolean,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [includeSupport, setIncludeSupport] = useState(false);
  const [originals, setOriginals] = useState(() => new Set(report.rows.map((r) => r.problemId)));
  const [chosen, setChosen] = useState(
    () =>
      new Set(
        report.rows.flatMap((r) =>
          r.links.filter((l) => l.relation !== "support").map((l) => choiceKey(r.problemId, l)),
        ),
      ),
  );
  const ps = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems]);
  const selection: ExamAnalysis = {
    ...report,
    rows: report.rows.map((r) => ({
      ...r,
      links: r.links.map((l) => ({
        ...l,
        selected:
          chosen.has(choiceKey(r.problemId, l)) && (includeSupport || l.relation !== "support"),
      })),
    })),
  };
  const count = exportRows(selection.rows, false, [...originals]).reduce(
    (n, r) => n + r.links.length,
    0,
  );
  function setGroup(id: string, checked: boolean) {
    setOriginals((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function chooseLinks(id: string, links: AnalysisLink[], checked: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      links.forEach((l) => {
        if (checked) next.add(choiceKey(id, l));
        else next.delete(choiceKey(id, l));
      });
      return next;
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90dvh] flex-col sm:max-w-3xl"
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>试卷分析导出 PDF</DialogTitle>
          <DialogDescription>选择原卷题目及关联练习，答案解析统一放在最后。</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeSupport}
            disabled={!!busy}
            onChange={(e) => {
              const enabled = e.target.checked;
              setIncludeSupport(enabled);
              if (enabled)
                setChosen(
                  (current) =>
                    new Set([
                      ...current,
                      ...report.rows.flatMap((r) =>
                        r.links
                          .filter((l) => l.relation === "support")
                          .map((l) => choiceKey(r.problemId, l)),
                      ),
                    ]),
                );
            }}
          />
          包含补充训练
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-auto" aria-live="polite">
            已选 {originals.size}/{report.rows.length} 道原题 · {count} 道关联练习（去重）
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy}
            onClick={() => {
              setOriginals(new Set(report.rows.map((r) => r.problemId)));
              setChosen(
                new Set(
                  report.rows.flatMap((r) =>
                    r.links
                      .filter((l) => includeSupport || l.relation !== "support")
                      .map((l) => choiceKey(r.problemId, l)),
                  ),
                ),
              );
            }}
          >
            全选
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy}
            onClick={() => {
              setOriginals(new Set());
              setChosen(new Set());
            }}
          >
            全不选
          </Button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto border-y border-border"
          aria-label="导出题目列表"
        >
          {report.rows.map((row, i) => {
            const links = row.links.filter((l) => includeSupport || l.relation !== "support");
            return (
              <section
                key={row.problemId}
                className="border-b border-border py-3 last:border-0"
                aria-label={`导出原卷第 ${i + 1} 题`}
              >
                <div className="flex items-start gap-2">
                  <label className="flex min-w-0 flex-1 items-start gap-2 font-semibold">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={originals.has(row.problemId)}
                      disabled={!!busy}
                      onChange={(e) => setGroup(row.problemId, e.target.checked)}
                    />
                    <span>
                      原卷第 {i + 1} 题 · {row.topic || ps.get(row.problemId)?.title}
                    </span>
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!!busy}
                    onClick={() => {
                      setGroup(row.problemId, true);
                      chooseLinks(row.problemId, links, true);
                    }}
                  >
                    全选本组
                  </Button>
                </div>
                <details className="ml-6 mt-2 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">预览原题</summary>
                  <MathText className="py-2" text={ps.get(row.problemId)?.stem || ""} />
                </details>
                <div className="ml-6 mt-2 space-y-1">
                  {links.map((l) => (
                    <label
                      key={linkKey(l)}
                      className="flex items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-secondary/50"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={
                          originals.has(row.problemId) && chosen.has(choiceKey(row.problemId, l))
                        }
                        disabled={!!busy || !originals.has(row.problemId)}
                        onChange={(e) => chooseLinks(row.problemId, [l], e.target.checked)}
                      />
                      <span className="min-w-0 break-words">
                        <span className="mr-2 font-medium text-primary">
                          {RELATION_LABEL[l.relation]}
                        </span>
                        {source(l.problemId)}
                        {l.parts.length ? ` · 第${l.parts.join("、")}小问` : ""}
                      </span>
                    </label>
                  ))}
                  {!links.length ? (
                    <p className="py-2 text-sm text-muted-foreground">本组仅导出原题</p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {busy ? (
          <p role="status" className="flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" />
            {busy}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={busy ? onCancel : onClose}>
            {busy ? "停止导出" : "取消"}
          </Button>
          <Button
            disabled={!!busy || !originals.size}
            onClick={() => void onExport(selection, [...originals], includeSupport)}
          >
            <Download className="size-4" />
            生成 PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
