import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Pencil, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { generateVariants } from "@/lib/ai/variants";
import {
  VARIANT_LEVELS, VARIANT_METHODS, VARIANT_MODES, variantSchema, variantReviewSchema,
  variantToProblem, type VariantRequest,
} from "@/lib/ai/variants-schema";
import { getProblemFn, upsertProblem } from "@/lib/problems/api";
import { MathText } from "@/lib/problems/math-text";
import { useProblemStore } from "@/lib/problems/store";
import type { Problem } from "@/lib/problems/types";

const draftSchema = variantSchema.extend({
  title: z.string().max(80), stem: z.string().max(8000),
  correctAnswer: z.string().max(2000), analysis: z.string().max(8000),
  review: variantReviewSchema, id: z.string().uuid(), batchId: z.string().uuid(),
  selected: z.boolean(), saved: z.boolean(),
});
type Draft = z.infer<typeof draftSchema>;
const selectClass = "h-10 w-full min-w-0 rounded-md border border-border bg-surface px-2 text-sm";

export function VariantDialog({ source, open: controlledOpen, onOpenChange }: { source: Problem; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState(source.collectionId || "");
  const [settings, setSettings] = useState<Omit<VariantRequest, "sourceId">>({
    mode: "method", level: "similar", method: "middle", count: 3, extra: "",
  });
  const collections = useProblemStore((s) => s.collections);
  const loadProblem = useProblemStore((s) => s.loadProblem);
  const key = `moti:variant-drafts:v1:${source.id}`;

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = z.array(draftSchema).max(20).safeParse(JSON.parse(raw));
        if (parsed.success) setDrafts(parsed.data);
      }
    } catch { /* Draft recovery must not prevent opening the problem. */ }
    setRestored(true);
  }, [key]);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(drafts));
    } catch {
      setError("候选草稿无法暂存，请勿刷新页面。已入库的题目不受影响。");
    }
  }, [drafts, key, restored]);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function edit(id: string, patch: Partial<Draft>) {
    setDrafts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function generate() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("generate");
    setError("");
    try {
      const result = await generateVariants({ data: { sourceId: source.id, ...settings } });
      if (!result.ok) { setError(result.error); return; }
      const batchId = crypto.randomUUID();
      setDrafts((items) => [...items, ...result.candidates.map((item) => ({
        ...item, id: crypto.randomUUID(), batchId, selected: false, saved: false,
      }))]);
    } catch {
      setError("请求中断，原题和已有候选均未修改，请重试。");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function save() {
    if (busyRef.current) return;
    if (collectionId && !collections.some((c) => c.id === collectionId)) {
      setError("所选小组已不存在，请重新选择。"); return;
    }
    busyRef.current = true;
    setBusy("save");
    setError("");
    let saved = 0;
    try {
      for (const [index, draft] of drafts.entries()) {
        if (!draft.selected || draft.saved) continue;
        const problem = variantToProblem(draft, source, {
          id: draft.id, collectionId, batchId: draft.batchId, order: index + 1, now: Date.now(),
        });
        // Stable draft IDs make retries safe after an uncertain network response.
        const existing = await getProblemFn({ data: { id: draft.id } });
        if (!existing) await upsertProblem({ data: problem });
        edit(draft.id, { saved: true, selected: false });
        saved += 1;
        await loadProblem(draft.id);
      }
      toast.success(`已保存 ${saved} 道 AI 变式`);
    } catch {
      setError(`已保存 ${saved} 道，其余保存失败。候选已保留，可重试，不会重复入库。`);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  const selectedCount = drafts.filter((d) => d.selected && !d.saved).length;
  return <>
    {controlledOpen === undefined ? <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!source.stem.trim()}>
      <Sparkles className="size-4" />生成变式
    </Button> : null}
    <Dialog open={open} onOpenChange={(value) => { if (!busyRef.current) setOpen(value); }}>
      <DialogContent className="flex max-h-[90dvh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
          <DialogTitle>生成变式</DialogTitle>
          <DialogDescription className="break-words">原题 · {source.title}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <fieldset disabled={!!busy} className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="space-y-1 text-sm">出题方式
                <select aria-label="出题方式" className={selectClass} value={settings.mode} onChange={(e) => setSettings({ ...settings, mode: e.target.value as VariantRequest["mode"] })}>
                  {Object.entries(VARIANT_MODES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">目标难度
                <select aria-label="目标难度" className={selectClass} value={settings.level} onChange={(e) => setSettings({ ...settings, level: e.target.value as VariantRequest["level"] })}>
                  {Object.entries(VARIANT_LEVELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">解法范围
                <select aria-label="解法范围" className={selectClass} value={settings.method} onChange={(e) => setSettings({ ...settings, method: e.target.value as VariantRequest["method"] })}>
                  {Object.entries(VARIANT_METHODS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">题数
                <Input aria-label="题数" type="number" min={1} max={5} step={1} value={settings.count} onChange={(e) => setSettings({ ...settings, count: Math.max(1, Math.min(5, Math.round(Number(e.target.value)) || 1)) })} />
              </label>
            </div>
            <label className="block space-y-1 text-sm">补充要求
              <Textarea aria-label="补充要求" maxLength={500} rows={2} value={settings.extra} onChange={(e) => setSettings({ ...settings, extra: e.target.value })} />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">纯文字与公式 · AI 复核不代表正确性保证 · 待人工核验</span>
              <Button onClick={() => void generate()} disabled={!!busy || drafts.length + settings.count > 20}>
                {busy === "generate" ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {busy === "generate" ? "生成与复核中…" : drafts.length ? "再生成一组" : "生成候选题"}
              </Button>
            </div>
          </fieldset>
          {drafts.length + settings.count > 20 && <p className="mt-2 text-sm text-muted-foreground">候选暂存上限为 20 道。</p>}
          {busy === "generate" && <p role="status" className="mt-3 text-sm text-muted-foreground">正在生成并逐题复核，可能需要几分钟。</p>}
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          <div className="mt-5 space-y-4">
            {drafts.map((draft, index) => <article key={draft.id} className="min-w-0 rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <label className="flex min-w-0 items-start gap-2 font-medium">
                  <input type="checkbox" aria-label={`选择候选 ${index + 1}`} className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]" checked={draft.selected} disabled={!!busy || draft.saved} onChange={(e) => edit(draft.id, { selected: e.target.checked })} />
                  <span className="break-words">{index + 1}. {draft.title}</span>
                </label>
                <div className="flex shrink-0 items-center gap-1">
                {draft.saved ? <a className="flex shrink-0 items-center gap-1 text-sm text-primary" href={`/p/${draft.id}`} target="_blank" rel="noreferrer"><Check className="size-4" />已入库</a> :
                  <Button variant="ghost" size="icon" disabled={!!busy} title={editing === draft.id ? "完成编辑" : "编辑候选"} aria-label={editing === draft.id ? "完成编辑" : `编辑候选 ${index + 1}`} onClick={() => setEditing(editing === draft.id ? null : draft.id)}><Pencil className="size-4" /></Button>}
                <ConfirmAction title="移除此候选？" description="仅移除候选草稿，已入库的题目不受影响。" confirmLabel="移除候选" onConfirm={() => setDrafts((items) => items.filter((item) => item.id !== draft.id))}>
                  <Button variant="ghost" size="icon" disabled={!!busy} title="移除候选" aria-label={`移除候选 ${index + 1}`}><Trash2 className="size-4" /></Button>
                </ConfirmAction>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">预估难度 {draft.difficulty} / 5 · {draft.review.passed ? "AI 复核未发现明显问题" : "待核查"}</p>
              {editing === draft.id && !draft.saved ? <div className="mt-3 space-y-3">
                {([['title', '标题', 80], ['stem', '题干', 8000], ['correctAnswer', '答案', 2000], ['analysis', '解析', 8000]] as const).map(([field, label, max]) =>
                  <label key={field} className="block space-y-1 text-sm">{label}<Textarea aria-label={`候选 ${index + 1} ${label}`} rows={field === "title" ? 1 : 3} maxLength={max} value={draft[field]} disabled={!!busy} onChange={(e) => edit(draft.id, { [field]: e.target.value, review: { passed: false, comment: "内容已手动修改，原 AI 复核结论失效，需重新核验。" } })} /></label>)}
              </div> : <>
                <MathText text={draft.stem} className="mt-3 break-words text-base" />
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="cursor-pointer text-sm font-medium">答案与解析</summary>
                  <MathText text={draft.correctAnswer} className="mt-3 text-sm" />
                  <MathText text={draft.analysis} className="mt-3 text-sm" />
                </details>
              </>}
              <p className="mt-3 break-words text-sm text-muted-foreground">变化：{draft.change}</p>
              <p className={`mt-2 break-words text-sm ${draft.review.passed ? "text-muted-foreground" : "text-amber-700"}`}>复核：{draft.review.comment}</p>
            </article>)}
          </div>
        </div>
        <footer className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-t border-border px-5 py-4">
          <label className="min-w-0 flex-1 space-y-1 text-sm sm:max-w-sm">保存到
            <select aria-label="保存到" className={selectClass} value={collectionId} disabled={!!busy} onChange={(e) => setCollectionId(e.target.value)}>
              <option value="">未分组</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.groupName ? `${c.groupName} / ` : ""}{c.name}</option>)}
            </select>
          </label>
          <Button disabled={!!busy || !selectedCount || drafts.some((d) => d.selected && !d.saved && !variantSchema.safeParse(d).success)} onClick={() => void save()}>
            {busy === "save" ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存所选{selectedCount ? `（${selectedCount}）` : ""}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  </>;
}
