import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { solveProblem } from "@/lib/ai/extract";
import { getProblemFn, saveSolutionFn } from "@/lib/problems/api";
import { MathText } from "@/lib/problems/math-text";
import { useProblemStore } from "@/lib/problems/store";
import type { Problem } from "@/lib/problems/types";

export function AnswerActions({ problem, disabled }: { problem: Problem; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [base, setBase] = useState<Problem | null>(null);
  const [answer, setAnswer] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [error, setError] = useState("");
  // Closing the preview or switching questions invalidates an in-flight generation.
  const request = useRef(0);
  const pendingSave = useRef(false);
  useEffect(() => () => { request.current++; }, []);

  function changeOpen(next: boolean) {
    if (pendingSave.current) return;
    if (!next) { request.current++; setBusy(false); }
    setOpen(next);
  }

  function start(nextMode: "manual" | "ai") {
    request.current++;
    setMode(nextMode); setOpen(true); setBusy(false); setBase(null); setError("");
    setAnswer(""); setAnalysis(""); setCustomPrompt("");
    if (nextMode === "manual") void generate(nextMode);
  }

  async function generate(nextMode: "manual" | "ai") {
    const token = ++request.current;
    setBusy(true); setBase(null); setError("");
    setAnswer(""); setAnalysis("");
    try {
      const latest = await getProblemFn({ data: { id: problem.id } });
      if (token !== request.current) return;
      if (!latest) throw new Error("题目不存在");
      if (latest.stem !== problem.stem || latest.correctAnswer !== problem.correctAnswer || latest.analysis !== problem.analysis) {
        throw new Error("题目内容尚未同步，请刷新核对后重试。");
      }
      if (nextMode === "manual") {
        setAnswer(latest.correctAnswer); setAnalysis(latest.analysis); setBase(latest);
      } else {
        const result = await solveProblem({ data: {
          stem: latest.stem,
          customPrompt: customPrompt.trim() || undefined,
          imageDataUrl: latest.figures[0]?.image || latest.figures[0]?.originalImage || latest.sourceImage,
        } });
        if (token !== request.current) return;
        if (!result.ok) throw new Error(result.error);
        setAnswer(result.correctAnswer); setAnalysis(result.analysis); setBase(latest);
      }
    } catch (e) {
      if (token === request.current) setError(e instanceof Error ? e.message : "读取或解答失败，请重试。");
    } finally { if (token === request.current) setBusy(false); }
  }

  async function save() {
    if (!base || pendingSave.current) return;
    pendingSave.current = true; setSaving(true); setError("");
    try {
      await saveSolutionFn({ data: { id: base.id, expected: {
        updatedAt: base.updatedAt, stem: base.stem, correctAnswer: base.correctAnswer, analysis: base.analysis,
      }, correctAnswer: answer, analysis } });
      await useProblemStore.getState().loadProblem(base.id);
      setOpen(false);
      toast.success("答案和解析已更新");
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败，请重试。"); }
    finally { pendingSave.current = false; setSaving(false); }
  }

  return <>
    <Button size="sm" variant="outline" disabled={disabled || open} onClick={() => void start("manual")}><Pencil className="size-4" />修正答案</Button>
    <Button size="sm" variant="outline" disabled={disabled || open || !problem.stem.trim()} onClick={() => void start("ai")}><Sparkles className="size-4" />{problem.correctAnswer.trim() || problem.analysis.trim() ? "重新 AI 答题" : "AI 解答"}</Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{mode === "manual" ? "修正答案与解析" : "AI 答题"}</DialogTitle>
          <DialogDescription>{mode === "manual" ? "修改后保存答案和解析。" : "按当前题干重新解答，核对后保存替换原答案和解析。"}</DialogDescription>
        </DialogHeader>
        {mode === "ai" ? <label className="block space-y-2">
          <span className="text-sm font-medium">自定义提示词（可选）</span>
          <Textarea aria-label="自定义提示词（可选）" value={customPrompt} maxLength={2000} disabled={busy || saving}
            onChange={e => setCustomPrompt(e.target.value)} className="min-h-24"
            placeholder="例如：用初中方法解答，不使用韦达定理；详细说明分类讨论过程。留空则使用默认方式。" />
        </label> : null}
        {busy ? <div role="status" className="flex items-center gap-2 py-8"><LoaderCircle className="size-5 animate-spin" />{mode === "ai" ? "正在按当前题干解答…" : "正在读取答案…"}</div> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {base ? <fieldset disabled={busy || saving} className="min-w-0 space-y-4">
          <label className="block space-y-2"><span className="text-sm font-medium">答案</span><Textarea aria-label="修正后的答案" value={answer} maxLength={2000} onChange={e => setAnswer(e.target.value)} className="min-h-24" /></label>
          <label className="block space-y-2"><span className="text-sm font-medium">解析</span><Textarea aria-label="修正后的解析" value={analysis} maxLength={8000} onChange={e => setAnalysis(e.target.value)} className="min-h-40" /></label>
          <details open={mode === "ai"}><summary className="cursor-pointer text-sm text-muted-foreground">公式预览</summary><div className="mt-3 space-y-4 rounded-md bg-secondary/60 p-4"><MathText text={answer} figures={base.figures} /><MathText text={analysis} figures={base.figures} /></div></details>
        </fieldset> : null}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => changeOpen(false)}>取消</Button>
          {mode === "ai" ? <Button variant={base ? "outline" : "default"} disabled={busy || saving} onClick={() => void generate("ai")}>
            <Sparkles className="size-4" />{busy ? "解答中…" : base ? "重新生成" : error ? "重试" : "开始解答"}
          </Button> : !busy && !base ? <Button variant="outline" onClick={() => void generate("manual")}>重试</Button> : null}
          <Button disabled={!base || busy || saving} onClick={() => void save()}>{saving ? "保存中…" : "保存答案与解析"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
