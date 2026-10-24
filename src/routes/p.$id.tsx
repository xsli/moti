import { createContext, useContext, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ImagePlus, LoaderCircle, MoreHorizontal, Pencil, Sparkles, Scissors, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CollectionPicker } from "@/components/notebook/collection-picker";
import { CropEditor } from "@/components/notebook/crop-editor";
import { FigureFrame } from "@/components/notebook/figure-frame";
import { FigureRedrawControls } from "@/components/notebook/figure-redraw-controls";
import { redrawDiagram } from "@/lib/image/figure";
import { TagEditor } from "@/components/notebook/tag-editor";
import { KnowledgeLink } from "@/components/notebook/knowledge-link";
import { VariantDialog } from "@/components/notebook/variant-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { solveProblem } from "@/lib/ai/extract";
import type { ImageBBox } from "@/lib/image/bbox";
import { cropDataUrl } from "@/lib/image/compress";
import { formatLoggedDateLong } from "@/lib/problems/dates";
import { usePaperStore } from "@/lib/paper/store";
import { MathText } from "@/lib/problems/math-text";
import { splitStemSections, stemSubproblemNumbers } from "@/lib/problems/subproblems";
import { useProblemStore } from "@/lib/problems/store";
import { sortBySourceOrder } from "@/lib/problems/order";
import { navigationPosition, readNavigation } from "@/lib/problems/navigation";
import {
  MASTERY_LABEL,
  MASTERY_DESCRIPTION,
  SUBJECT_LABEL,
  type Mastery,
  type Figure,
  type Problem,
} from "@/lib/problems/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p/$id")({
  validateSearch: (search: Record<string, unknown>): { browse?: string } => ({
    browse: typeof search.browse === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(search.browse) ? search.browse : undefined,
  }),
  component: ProblemPage,
});

function ProblemPage() {
  const { id } = Route.useParams();
  const problem = useProblemStore((s) => s.problems.find((p) => p.id === id));
  const status = useProblemStore((s) => s.status);
  const loadProblem = useProblemStore((s) => s.loadProblem);

  useEffect(() => {
    void loadProblem(id);
  }, [id, loadProblem]);

  if (status !== "ready" && !problem) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-24 animate-pulse rounded-md bg-rule" />
        <div className="h-64 animate-pulse rounded-xl bg-rule" />
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="font-display text-2xl font-semibold">找不到这道题</p>
        <BackButton className="mt-6"><Link to="/" /></BackButton>
      </div>
    );
  }

  return <ProblemDetail key={problem.id} problem={problem} />;
}

const DetailEditing = createContext({ enabled: false, setPending: (_update: (count: number) => number) => {} });

function ProblemDetail({ problem }: { problem: Problem }) {
  const navigate = useNavigate();
  const { browse } = Route.useSearch();
  const problems = useProblemStore((s) => s.problems);
  const [snapshot, setSnapshot] = useState<string[] | null>(null);
  useEffect(() => { setSnapshot(readNavigation(browse)); }, [browse]);
  const navigation = useMemo(() => {
    const ids = snapshot?.includes(problem.id) ? snapshot : sortBySourceOrder(
      problems.filter((item) => item.collectionId === problem.collectionId),
    ).map((item) => item.id);
    return navigationPosition(ids, problem.id, problems.map((item) => item.id));
  }, [snapshot, problems, problem.id, problem.collectionId]);
  const updateProblem = useProblemStore((s) => s.updateProblem);
  const deleteProblem = useProblemStore((s) => s.deleteProblem);
  const addToBasket = usePaperStore((s) => s.addToBasket);
  const inBasket = usePaperStore((s) => s.basket.includes(problem.id));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(0);
  const [variantOpen, setVariantOpen] = useState(false);
  const collection = useProblemStore((s) => s.collections.find((c) => c.id === problem.collectionId));
  const [cropOpen, setCropOpen] = useState(false);
  const [cropBox, setCropBox] = useState<ImageBBox>({ x: 0.38, y: 0.26, w: 0.58, h: 0.6 });
  const cropBoxRef = useRef(cropBox);
  const [cropAnchor, setCropAnchor] = useState(0);
  const [cropReplaceId, setCropReplaceId] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [solving, setSolving] = useState(false);
  const hasAnswer = Boolean(problem.correctAnswer.trim());
  const parentGroupId = problem.collectionId || "ungrouped";
  const subproblemNumbers = useMemo(() => stemSubproblemNumbers(problem.stem), [problem.stem]);

  function openCrop(figure?: Figure) {
    const box = { x: 0.38, y: 0.26, w: 0.58, h: 0.6 };
    cropBoxRef.current = box;
    setCropBox(box);
    setCropAnchor(figure?.subproblem ?? subproblemNumbers[0] ?? 0);
    setCropReplaceId(figure?.id ?? null);
    setCropOpen(true);
  }

  async function removeFigure(id: string) {
    await updateProblem(problem.id, { figures: problem.figures.filter((figure) => figure.id !== id) });
  }

  async function updateFigure(next: Figure) {
    const latest = useProblemStore.getState().problems.find((p) => p.id === problem.id);
    if (!latest?.figures.some((f) => f.id === next.id)) return;
    await updateProblem(problem.id, { figures: latest.figures.map((f) => f.id === next.id
      ? { ...f, image: next.image, svg: next.svg, originalImage: next.originalImage, redrawError: next.redrawError } : f) });
  }

  async function askGrok() {
    if (!problem.stem.trim()) {
      toast.error("题干是空的，没法解答。");
      return;
    }
    setSolving(true);
    try {
      const result = await solveProblem({
        data: {
          stem: problem.stem,
          imageDataUrl: problem.figures[0]?.originalImage || problem.figures[0]?.image || problem.sourceImage,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await updateProblem(problem.id, {
        correctAnswer: result.correctAnswer,
        analysis: result.analysis,
      });
      toast.success("已写入答案和解析");
    } catch {
      toast.error("解答中断了，请再试一次。");
    } finally {
      setSolving(false);
    }
  }

  async function applyCrop() {
    if (!problem.sourceImage) return;
    setCropping(true);
    try {
      const cropped = await cropDataUrl(problem.sourceImage, cropBoxRef.current, 0);
      const current = cropReplaceId ? problem.figures.find((figure) => figure.id === cropReplaceId) : undefined;
      const nextFigure: Figure = await redrawDiagram({
        id: current?.id ?? crypto.randomUUID(),
        title: current?.title ?? "图形",
        caption: current?.caption ?? "",
        svg: "",
        image: cropped,
        subproblem: cropAnchor || undefined,
      }, problem.stem);
        const latest = useProblemStore.getState().problems.find((item) => item.id === problem.id);
        if (!latest) return;
        if (current && !latest.figures.some((figure) => figure.id === current.id && figure.image === current.image)) {
          toast.error("配图已发生变化，请重新框选。");
          return;
        }
      await updateProblem(problem.id, {
        figures: current
            ? latest.figures.map((figure) => (figure.id === current.id ? nextFigure : figure))
            : [...latest.figures, nextFigure],
      });
      setCropOpen(false);
      toast.success(cropAnchor ? `图形已跟随小题（${cropAnchor}）` : "图形已放在整题后");
      } catch {
        toast.error("保存配图失败，请重试。");
    } finally {
      setCropping(false);
    }
  }

  return (
    <DetailEditing.Provider value={{ enabled: editing, setPending }}>
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton><Link to="/" search={{ g: parentGroupId }} /></BackButton>
        <nav aria-label="题目切换" className="flex shrink-0 items-center gap-1 sm:ml-auto">
          <Button type="button" variant="ghost" size="icon" title="上一题" aria-label="上一题" disabled={!navigation.previous}
            onClick={() => { if (navigation.previous) void navigate({ to: "/p/$id", params: { id: navigation.previous }, search: { browse } }); }}>
            <ChevronLeft />
          </Button>
          <span aria-live="polite" className="w-28 text-center text-sm tabular-nums text-muted-foreground">
            第 {navigation.index + 1} / {navigation.total} 题
          </span>
          <Button type="button" variant="ghost" size="icon" title="下一题" aria-label="下一题" disabled={!navigation.next}
            onClick={() => { if (navigation.next) void navigate({ to: "/p/$id", params: { id: navigation.next }, search: { browse } }); }}>
            <ChevronRight />
          </Button>
        </nav>
        <div className="flex flex-wrap gap-2">
          <KnowledgeLink key={problem.id} scope={{ problemIds: [problem.id] }} disabled={pending > 0 || !problem.stem.trim()} />
          <VariantDialog source={problem} open={variantOpen} onOpenChange={setVariantOpen} />
          <Button
            variant="outline"
            size="sm"
            disabled={inBasket}
            onClick={() => {
              const n = addToBasket([problem.id]);
              if (n) toast.success("已加入组卷篮");
              else toast.error("题目已选中，或已达选题上限");
            }}
          >
            {inBasket ? "已加入组卷篮" : "加入组卷篮"}
          </Button>
          <Button variant={editing ? "secondary" : "outline"} size="sm" disabled={pending > 0} title={pending ? "请先保存或取消当前修改" : "编辑题目"} onClick={() => setEditing(!editing)}><Pencil />{editing ? "退出编辑" : "编辑"}</Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="更多操作" title="更多操作"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!problem.stem.trim()} onSelect={() => setVariantOpen(true)}>生成变式</DropdownMenuItem><DropdownMenuItem className="text-destructive" onSelect={() => setConfirmDelete(true)}><Trash2 />删除题目</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      </div>

      <article className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{SUBJECT_LABEL[problem.subject]}</Badge>
          <div className="ml-1 flex items-center gap-0.5" aria-label={`难度 ${problem.difficulty} 级`}>
            <span className="mr-1 text-xs text-muted-foreground">难度</span>
            {([1, 2, 3, 4, 5] as const).map((level) => (
              <button
                key={level}
                type="button"
                className={cn(
                  "grid size-5 place-items-center transition-colors",
                  level <= problem.difficulty ? "text-primary" : "text-border hover:text-muted-foreground",
                )}
                aria-label={`设为 ${level} 级难度`}
                title={`${level} 级难度`}
                disabled={!editing}
                onClick={() => void updateProblem(problem.id, { difficulty: level })}
              >
                <Star className={cn("size-3.5", level <= problem.difficulty && "fill-current")} />
              </button>
            ))}
          </div>
          <select
            value={problem.mastery}
            onChange={(event) => void updateProblem(problem.id, { mastery: event.target.value as Mastery })}
            className={cn(
              "h-7 rounded-full border px-2.5 text-xs outline-none transition-colors focus:ring-2 focus:ring-ring/30",
              problem.mastery === "mastered"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-surface text-muted-foreground",
            )}
            aria-label="修改掌握程度"
            title={MASTERY_DESCRIPTION[problem.mastery]}
          >
            {(["new", "reviewing", "mastered"] as Mastery[]).map((mastery) => (
              <option key={mastery} value={mastery}>{MASTERY_LABEL[mastery]}</option>
            ))}
          </select>
        </div>
        <div className="py-4">
          <EditableTitle
            value={problem.title}
            onSave={(title) => void updateProblem(problem.id, { title })}
          />
          <div className="mt-4">
            <EditableMath
              value={problem.stem}
              placeholder="题干"
              previewClass="text-lg"
              tall
              header={
                editing ? <CollectionPicker
                  value={problem.collectionId ?? ""}
                  onChange={(id) => void updateProblem(problem.id, { collectionId: id || undefined })}
                  label=""
                  showFieldLabels={false}
                /> : <p className="text-sm text-muted-foreground">{collection ? `${collection.groupName || "未分大组"} / ${collection.name}` : "未分组"}</p>
              }
              onSave={(stem) => void updateProblem(problem.id, { stem })}
              renderPreview={(stem) => (
                <StemWithFigures
                  stem={stem}
                  figures={problem.figures}
                  onRecrop={openCrop}
                  onRemove={(figure) => removeFigure(figure.id)}
                  onChange={updateFigure}
                />
              )}
            />
          </div>
          <div className="mt-5">
            {editing ? <TagEditor
              tags={problem.tags}
              onChange={(tags) => void updateProblem(problem.id, { tags })}
            /> : <div className="flex flex-wrap gap-2">{problem.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>}
          </div>
        </div>
        {problem.figures
          .filter((figure) => !figure.inline && (!figure.subproblem || !subproblemNumbers.includes(figure.subproblem)))
          .map((figure) => (
            <FigureWithActions key={figure.id} figure={figure} stem={problem.stem} onChange={updateFigure} onRecrop={openCrop} onRemove={(item) => removeFigure(item.id)} />
          ))}
        {editing && problem.sourceImage ? (
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => openCrop()}>
              <ImagePlus className="size-4" />
              添加图形
            </Button>
          </div>
        ) : null}
      </article>

      <Panel tone="answer">
        <EditableMath
          value={problem.correctAnswer}
          renderPreview={(text) => <MathText text={text} figures={problem.figures} tight />}
          placeholder="正确答案"
          header={<FieldHeading emphasized>答案</FieldHeading>}
          headerAction={
            !hasAnswer ? (
            <Button size="sm" variant="outline" onClick={() => void askGrok()} disabled={solving}>
              {solving ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {solving ? "正在解答…" : "AI 解答"}
            </Button>
            ) : null
          }
          emptyText={solving ? "正在生成答案…" : undefined}
          onSave={(correctAnswer) => void updateProblem(problem.id, { correctAnswer })}
        />
      </Panel>

      <Panel tone="analysis">
        <EditableMath
          value={problem.analysis}
          renderPreview={(text) => <MathText text={text} figures={problem.figures} tight />}
          placeholder="解析"
          header={<FieldHeading emphasized>解析</FieldHeading>}
          emptyText={solving ? "正在生成解析…" : undefined}
          tall
          onSave={(analysis) => void updateProblem(problem.id, { analysis })}
        />
      </Panel>

      {editing || (problem.notes.trim() && !/^(?:来源|出处)[：:][^\n]+$/.test(problem.notes.trim())) ? <Panel><EditableMath value={problem.notes} placeholder="笔记" header={<FieldHeading>笔记</FieldHeading>} onSave={(notes) => void updateProblem(problem.id, { notes })} /></Panel> : null}
      <details className="border-t border-border pt-4 text-sm text-muted-foreground"><summary className="cursor-pointer">来源信息</summary><div className="mt-3 space-y-3">{/^(?:来源|出处)[：:][^\n]+$/.test(problem.notes.trim()) ? <p>{problem.notes}</p> : null}<p>录入日期：{formatLoggedDateLong(problem.createdAt)}</p>{problem.sourceOrder ? <p>原题号：{problem.sourceOrder}</p> : null}{problem.sourceImage ? <img src={problem.sourceImage} alt="原题截图" loading="lazy" className="max-h-[600px] max-w-full object-contain" /> : <p>暂无原题截图</p>}</div></details>

      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>框选图形</DialogTitle>
            <DialogDescription>一幅图框一次，并选择它跟随哪一道小题。</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <label htmlFor="detail-figure-anchor" className="text-sm font-medium">跟随位置</label>
            <select
              id="detail-figure-anchor"
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
              value={cropAnchor}
              onChange={(event) => setCropAnchor(Number(event.target.value))}
            >
              <option value={0}>整题后</option>
              {subproblemNumbers.map((number) => <option key={number} value={number}>小题（{number}）后</option>)}
            </select>
          </div>
          {problem.sourceImage ? (
            <CropEditor
              src={problem.sourceImage}
              value={cropBox}
              onCommit={(box) => {
                cropBoxRef.current = box;
                setCropBox(box);
              }}
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCropOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void applyCrop()} disabled={cropping}>
              {cropping ? "裁切中…" : "用这块"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除这道题？</DialogTitle>
            <DialogDescription>删除后无法恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                void deleteProblem(problem.id).then(() => {
                  setConfirmDelete(false);
                  toast.success("已删除");
                  void navigate({ to: "/", search: { g: parentGroupId } });
                });
              }}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DetailEditing.Provider>
  );
}

function Panel({
  title,
  action,
  children,
  tone,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  tone?: "answer" | "analysis";
}) {
  const hasHeader = Boolean(title || action);
  return (
    <section className={cn("min-w-0 border-l-2 p-4", tone === "answer" ? "border-emerald-700/40 bg-emerald-50/70 text-emerald-900" : tone === "analysis" ? "border-sky-700/40 bg-sky-50/70 text-sm text-sky-900 [&_.katex]:text-[1.05em]!" : "border-border")}>
      {hasHeader ? (
        <div className="flex items-center justify-between gap-3">
          {title ? <FieldHeading>{title}</FieldHeading> : <span />}
          {action}
        </div>
      ) : null}
      <div className={hasHeader ? "mt-3" : undefined}>{children}</div>
    </section>
  );
}

function FieldHeading({ children, emphasized = false }: { children: ReactNode; emphasized?: boolean }) {
  return (
    <h2 className={cn(emphasized ? "text-sm font-semibold" : "text-sm font-medium text-muted-foreground")}>
      {children}
    </h2>
  );
}

function EditToggle({
  label = "内容",
  editing,
  onEdit,
  onSave,
  onCancel,
}: {
  label?: string;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { enabled } = useContext(DetailEditing);
  if (!enabled) return null;
  if (!editing) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-rule hover:text-fg"
            aria-label={`编辑${label}`}
            onClick={onEdit}
          >
            <Pencil className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>编辑{label}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button type="button" className="text-xs text-muted-foreground hover:text-fg" onClick={onCancel}>
        取消
      </button>
      <button type="button" className="text-xs font-medium text-primary hover:text-fg" onClick={onSave}>
        保存
      </button>
    </span>
  );
}

function EditableTitle({ value, onSave }: { value: string; onSave: (next: string) => void }) {
  const { enabled } = useContext(DetailEditing);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useUnsavedEdit(editing && draft !== value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (!enabled) { setEditing(false); setDraft(value); }
  }, [enabled, value]);

  function save() {
    const next = draft.trim().slice(0, 80) || "未命名题目";
    setEditing(false);
    if (next !== value) onSave(next);
  }

  return (
    <div className="flex items-start justify-between gap-3">
      {editing ? (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="font-display text-xl font-semibold"
          autoFocus
        />
      ) : (
        <h1 className="min-w-0 flex-1 font-display text-xl font-semibold sm:text-2xl">{value}</h1>
      )}
      <EditToggle
        label="标题"
        editing={editing}
        onEdit={() => setEditing(true)}
        onSave={save}
        onCancel={() => {
          setDraft(value);
          setEditing(false);
        }}
      />
    </div>
  );
}

function FigureWithActions({
  figure,
  stem,
  onChange,
  onRecrop,
  onRemove,
}: {
  figure: Figure;
  stem: string;
  onChange: (figure: Figure) => void | Promise<void>;
  onRecrop: (figure: Figure) => void;
  onRemove: (figure: Figure) => void | Promise<void>;
}) {
  const { enabled } = useContext(DetailEditing);
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
      <FigureFrame svg={figure.svg} image={figure.image} caption={figure.caption || figure.title} />
      {enabled ? <>
      <FigureRedrawControls figure={figure} stem={stem} onChange={onChange} />
      <div className="flex justify-end gap-1 border-t border-border px-2 py-1.5">
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onRecrop(figure)}>
          <Scissors className="size-3.5" />
          重新框选
        </Button>
        <ConfirmAction title={`删除图形${figure.title ? `“${figure.title}”` : ""}？`} description="此图形将从题目中移除，原题截图会保留。" onConfirm={() => onRemove(figure)}>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive">
          <Trash2 className="size-3.5" />
          删除图形
        </Button>
        </ConfirmAction>
      </div>
      </> : null}
    </div>
  );
}

function StemWithFigures({
  stem,
  figures,
  onRecrop,
  onRemove,
  onChange,
}: {
  stem: string;
  figures: Figure[];
  onRecrop: (figure: Figure) => void;
  onRemove: (figure: Figure) => void | Promise<void>;
  onChange: (figure: Figure) => void | Promise<void>;
}) {
  const sections = splitStemSections(stem);
  return (
    <div className="space-y-3">
      {sections.map((section, index) => (
        <div key={`${section.subproblem}-${index}`}>
          <MathText text={section.text} figures={figures} className="text-base" />
          {section.subproblem > 0
            ? figures
                .filter((figure) => !figure.inline && figure.subproblem === section.subproblem)
                .map((figure) => (
                  <FigureWithActions key={figure.id} figure={figure} stem={stem} onChange={onChange} onRecrop={onRecrop} onRemove={onRemove} />
                ))
            : null}
        </div>
      ))}
    </div>
  );
}

function EditableMath({
  value,
  onSave,
  placeholder,
  tall,
  previewClass,
  renderPreview,
  header,
  headerAction,
  emptyText = "（未填写）",
}: {
  value: string;
  onSave: (next: string) => void;
  placeholder: string;
  tall?: boolean;
  previewClass?: string;
  renderPreview?: (value: string) => ReactNode;
  header?: ReactNode;
  headerAction?: ReactNode;
  emptyText?: string;
}) {
  const { enabled } = useContext(DetailEditing);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useUnsavedEdit(editing && draft !== value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (!enabled) { setEditing(false); setDraft(value); }
  }, [enabled, value]);

  function save() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {header ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">{header}</div>
          <div className="flex shrink-0 items-center gap-2">
            {headerAction}
            <EditToggle label={placeholder} editing={editing} onEdit={() => setEditing(true)} onSave={save} onCancel={cancel} />
          </div>
        </div>
      ) : null}
      {editing ? (
        <>
          {!header ? <div className="flex justify-end">
            <EditToggle label={placeholder} editing onEdit={() => setEditing(true)} onSave={save} onCancel={cancel} />
          </div> : null}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`用中文和 $LaTeX$ 写${placeholder}`}
            className={tall ? "min-h-40" : "min-h-24"}
            autoFocus
          />
          <div className="rounded-md bg-secondary/60 px-3 py-3">
            <p className="mb-2 text-[11px] tracking-wider text-muted-foreground">预览</p>
            {draft.trim() ? (
              renderPreview ? renderPreview(draft) : <MathText text={draft} className={previewClass} />
            ) : (
              <p className="text-sm text-muted-foreground">（空）</p>
            )}
          </div>
        </>
      ) : header ? (
        <div className="min-w-0">
          {value.trim() ? (
            renderPreview ? renderPreview(value) : <MathText text={value} tight className={previewClass} />
          ) : (
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            {value.trim() ? (
              renderPreview ? renderPreview(value) : <MathText text={value} tight className={previewClass} />
            ) : (
              <p className="text-sm text-muted-foreground">{emptyText}</p>
            )}
          </div>
          <EditToggle label={placeholder} editing={false} onEdit={() => setEditing(true)} onSave={save} onCancel={cancel} />
        </div>
      )}
    </div>
  );
}

function useUnsavedEdit(dirty: boolean) {
  const { setPending } = useContext(DetailEditing);
  useEffect(() => {
    if (!dirty) return;
    setPending((count) => count + 1);
    return () => setPending((count) => count - 1);
  }, [dirty, setPending]);
  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm("有尚未保存的修改，确定放弃修改并离开？"),
    enableBeforeUnload: dirty,
  });
}
