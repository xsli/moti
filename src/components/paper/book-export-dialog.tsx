import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Collection } from "@/lib/problems/collections";
import type { Problem } from "@/lib/problems/types";
import { bookChapters } from "@/lib/paper/book";
import { paperFileStem } from "@/lib/paper/sample";
import type { BlankLines } from "@/lib/paper/space";

export function BookExportDialog({
  folder,
  collections,
  problems,
}: {
  folder: string;
  collections: Collection[];
  problems: Problem[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(folder || "未分大组");
  const [answers, setAnswers] = useState(false);
  const [blankLines, setBlankLines] = useState<BlankLines>(2);
  const [dpi, setDpi] = useState(300);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; filename: string; pages: number } | null>(
    null,
  );
  const [chapterOrder, setChapterOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const controller = useRef<AbortController | null>(null);
  const chapters = useMemo(
    () => bookChapters(folder, collections, problems),
    [folder, collections, problems],
  );
  const count = chapters.reduce((sum, c) => sum + c.problemIds.length, 0);
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const ordered = chapterOrder.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const chosen = ordered.filter((c) => selected.has(c.id));
  const selectedCount = chosen.reduce((n, c) => n + c.problemIds.length, 0);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );

  async function generate() {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setResult(null);
    setMessage("准备导出…");
    try {
      const { exportBook } = await import("@/lib/paper/book-export");
      const pdf = await exportBook(
        {
          folder,
          title: title.trim(),
          withAnswers: answers,
          blankLines,
          dpi,
          chapterIds: chosen.map((c) => c.id),
        },
        abort.signal,
        setMessage,
      );
      const url = URL.createObjectURL(pdf.blob);
      const filename = `${paperFileStem(title)}${answers ? "-解析版" : ""}.pdf`;
      setResult({ url, filename, pages: pdf.pages });
      setMessage(`已生成 ${pdf.problems} 道题，共 ${pdf.pages} 页`);
    } catch (e) {
      if (abort.signal.aborted) setMessage("已取消生成");
      else {
        setMessage("");
        setError(e instanceof Error ? e.message : "导出失败，请重试");
      }
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }

  function move(index: number, delta: number) {
    const next = [...chapterOrder];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setChapterOrder(next);
    setResult(null);
    setMessage("");
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={!count}
        onClick={() => {
          setChapterOrder(chapters.map((c) => c.id));
          setSelected(new Set(chapters.map((c) => c.id)));
          setResult(null);
          setMessage("");
          setError("");
          setOpen(true);
        }}
      >
        <Download className="size-4" />
        导出 PDF
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>章节导出 PDF</DialogTitle>
            <DialogDescription className="sr-only">选择章节与导出设置</DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm">
              书名
              <Input
                value={title}
                maxLength={80}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setResult(null);
                  setMessage("");
                }}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                题后留白
                <select
                  aria-label="题后留白"
                  className="h-10 rounded-md border border-border bg-surface px-2"
                  value={blankLines}
                  disabled={answers || busy}
                  onChange={(e) => {
                    setBlankLines(Number(e.target.value) as BlankLines);
                    setResult(null);
                    setMessage("");
                  }}
                >
                  <option value={2}>小</option>
                  <option value={5}>中</option>
                  <option value={8}>大</option>
                </select>
              </label>
              <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">高级选项</summary><label className="mt-2 flex flex-col gap-2 text-sm">
                清晰度
                <select
                  aria-label="清晰度"
                  className="h-10 rounded-md border border-border bg-surface px-2"
                  value={dpi}
                  onChange={(e) => {
                    setDpi(Number(e.target.value));
                    setResult(null);
                    setMessage("");
                  }}
                >
                  <option value={200}>标准 · 200 DPI</option>
                  <option value={300}>高清 · 300 DPI</option>
                </select>
              </label></details>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={answers}
                onChange={(e) => {
                  setAnswers(e.target.checked);
                  setResult(null);
                  setMessage("");
                }}
              />
              附带已有答案与解析
            </label>
          </fieldset>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mr-auto">
              已选 {chosen.length}/{chapters.length} 章 · {selectedCount} 道题
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSelected(new Set(chapterOrder));
                setResult(null);
                setMessage("");
              }}
            >
              全选
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSelected(new Set());
                setResult(null);
                setMessage("");
              }}
            >
              全不选
            </Button>
          </div>
          <ol className="max-h-56 overflow-y-auto border-y border-border py-2 text-sm">
            {ordered.map((c, index) => (
              <li key={c.id} className="flex items-center gap-2 py-1.5">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    disabled={busy}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      setSelected(next);
                      setResult(null);
                      setMessage("");
                    }}
                  />
                  <span className="min-w-0 whitespace-normal break-words">{c.title}</span>
                </label>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.problemIds.length} 题
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  title={`上移 ${c.title}`}
                  aria-label={`上移 ${c.title}`}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  title={`下移 ${c.title}`}
                  aria-label={`下移 ${c.title}`}
                  disabled={busy || index === ordered.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
              </li>
            ))}
          </ol>
          {message ? (
            <p role="status" className="flex items-start gap-2 break-words text-sm">
              {busy ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" /> : null}
              {message}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            {busy ? (
              <Button variant="outline" onClick={() => controller.current?.abort()}>
                取消生成
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  关闭
                </Button>
                {result ? (
                  <Button asChild>
                    <a href={result.url} download={result.filename}>
                      <Download className="size-4" />
                      下载 PDF
                    </a>
                  </Button>
                ) : (
                  <Button
                    disabled={!title.trim() || !selectedCount}
                    onClick={() => void generate()}
                  >
                    <Download className="size-4" />
                    生成 PDF
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
