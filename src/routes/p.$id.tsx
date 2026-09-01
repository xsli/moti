import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, Pencil, Sparkles, Scissors, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CollectionPicker } from "@/components/notebook/collection-picker";
import { CropEditor } from "@/components/notebook/crop-editor";
import { FigureFrame } from "@/components/notebook/figure-frame";
import { TagEditor } from "@/components/notebook/tag-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  MASTERY_LABEL,
  MASTERY_DESCRIPTION,
  SUBJECT_LABEL,
  type Mastery,
  type Figure,
  type Problem,
} from "@/lib/problems/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p/$id")({ component: ProblemPage });

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
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">回到本子</Link>
        </Button>
      </div>
    );
  }

  return <ProblemDetail problem={problem} />;
}

function ProblemDetail({ problem }: { problem: Problem }) {
  const navigate = useNavigate();
  const updateProblem = useProblemStore((s) => s.updateProblem);
  const deleteProblem = useProblemStore((s) => s.deleteProblem);
  const addToBasket = usePaperStore((s) => s.addToBasket);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropBox, setCropBox] = useState<ImageBBox>({ x: 0.38, y: 0.26, w: 0.58, h: 0.6 });
  const cropBoxRef = useRef(cropBox);
  const [cropAnchor, setCropAnchor] = useState(0);
  const [cropReplaceId, setCropReplaceId] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [solving, setSolving] = useState(false);
  const noteValue = notes ?? problem.notes;
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
          imageDataUrl: problem.figures[0]?.image || problem.sourceImage,
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
      const nextFigure: Figure = {
        id: current?.id ?? crypto.randomUUID(),
        title: current?.title ?? "图形",
        caption: current?.caption ?? "",
        svg: "",
        image: cropped,
        subproblem: cropAnchor || undefined,
      };
      await updateProblem(problem.id, {
        figures: current
          ? problem.figures.map((figure) => (figure.id === current.id ? nextFigure : figure))
          : [...problem.figures, nextFigure],
      });
      setCropOpen(false);
      toast.success(cropAnchor ? `图形已跟随小题（${cropAnchor}）` : "图形已放在整题后");
    } finally {
      setCropping(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/" search={{ g: parentGroupId }}>
            <ArrowLeft className="size-4" />
            返回
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const n = addToBasket([problem.id]);
              toast.success(n ? "已放入组卷篮" : "已在组卷篮里");
            }}
          >
            加入组卷篮
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
            删除
          </Button>
        </div>
      </div>

      <article className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-center gap-2 px-5 pt-5 sm:px-6">
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
        <div className="px-5 py-5 sm:px-6">
          <EditableTitle
            value={problem.title}
            onSave={(title) => void updateProblem(problem.id, { title })}
          />
          <p className="mt-2 text-sm text-muted-foreground">{formatLoggedDateLong(problem.createdAt)}</p>
          <div className="mt-4">
            <EditableMath
              value={problem.stem}
              placeholder="题干"
              previewClass="text-lg"
              tall
              header={
                <CollectionPicker
                  value={problem.collectionId ?? ""}
                  onChange={(id) => void updateProblem(problem.id, { collectionId: id || undefined })}
                  label=""
                  showFieldLabels={false}
                />
              }
              onSave={(stem) => void updateProblem(problem.id, { stem })}
              renderPreview={(stem) => (
                <StemWithFigures
                  stem={stem}
                  figures={problem.figures}
                  onRecrop={openCrop}
                  onRemove={(figure) => void removeFigure(figure.id)}
                />
              )}
            />
          </div>
          <div className="mt-5">
            <TagEditor
              tags={problem.tags}
              onChange={(tags) => void updateProblem(problem.id, { tags })}
            />
          </div>
        </div>
        {problem.figures
          .filter((figure) => !figure.subproblem || !subproblemNumbers.includes(figure.subproblem))
          .map((figure) => (
            <FigureWithActions key={figure.id} figure={figure} onRecrop={openCrop} onRemove={(item) => void removeFigure(item.id)} />
          ))}
        {problem.sourceImage ? (
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => openCrop()}>
              <Scissors className="size-4" />
              添加图形
            </Button>
          </div>
        ) : null}
      </article>

      <Panel>
        <EditableMath
          value={problem.correctAnswer}
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

      <Panel>
        <EditableMath
          value={problem.analysis}
          placeholder="解析"
          header={<FieldHeading emphasized>解析</FieldHeading>}
          emptyText={solving ? "正在生成解析…" : undefined}
          tall
          onSave={(analysis) => void updateProblem(problem.id, { analysis })}
        />
      </Panel>

      <Panel title="笔记">
        <Textarea
          value={noteValue}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== null && notes !== problem.notes) {
              void updateProblem(problem.id, { notes });
            }
          }}
          placeholder="写下自己要记住的一点"
        />
      </Panel>

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
            <DialogTitle>从本子里拿掉？</DialogTitle>
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
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const hasHeader = Boolean(title || action);
  return (
    <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
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
    <h2 className={cn(emphasized ? "text-base font-semibold text-fg" : "text-xs font-medium tracking-wider text-muted-foreground")}>
      {children}
    </h2>
  );
}

function EditToggle({
  editing,
  onEdit,
  onSave,
  onCancel,
}: {
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!editing) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-rule hover:text-fg"
            aria-label="修改"
            onClick={onEdit}
          >
            <Pencil className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>修改</TooltipContent>
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

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
        <h1 className="min-w-0 flex-1 font-display text-xl font-semibold tracking-tight sm:text-2xl">{value}</h1>
      )}
      <EditToggle
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
  onRecrop,
  onRemove,
}: {
  figure: Figure;
  onRecrop: (figure: Figure) => void;
  onRemove: (figure: Figure) => void;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
      <FigureFrame svg={figure.svg} image={figure.image} caption={figure.caption || figure.title} />
      <div className="flex justify-end gap-1 border-t border-border px-2 py-1.5">
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onRecrop(figure)}>
          <Scissors className="size-3.5" />
          重新框选
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => onRemove(figure)}>
          <Trash2 className="size-3.5" />
          删除图形
        </Button>
      </div>
    </div>
  );
}

function StemWithFigures({
  stem,
  figures,
  onRecrop,
  onRemove,
}: {
  stem: string;
  figures: Figure[];
  onRecrop: (figure: Figure) => void;
  onRemove: (figure: Figure) => void;
}) {
  const sections = splitStemSections(stem);
  return (
    <div className="space-y-3">
      {sections.map((section, index) => (
        <div key={`${section.subproblem}-${index}`}>
          <MathText text={section.text} className="text-lg" />
          {section.subproblem > 0
            ? figures
                .filter((figure) => figure.subproblem === section.subproblem)
                .map((figure) => (
                  <FigureWithActions key={figure.id} figure={figure} onRecrop={onRecrop} onRemove={onRemove} />
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

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
            <EditToggle editing={editing} onEdit={() => setEditing(true)} onSave={save} onCancel={cancel} />
          </div>
        </div>
      ) : null}
      {editing ? (
        <>
          {!header ? <div className="flex justify-end">
            <EditToggle editing onEdit={() => setEditing(true)} onSave={save} onCancel={cancel} />
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
            renderPreview ? renderPreview(value) : <MathText text={value} className={previewClass} />
          ) : (
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            {value.trim() ? (
              renderPreview ? renderPreview(value) : <MathText text={value} className={previewClass} />
            ) : (
              <p className="text-sm text-muted-foreground">{emptyText}</p>
            )}
          </div>
          <EditToggle editing={false} onEdit={() => setEditing(true)} onSave={save} onCancel={cancel} />
        </div>
      )}
    </div>
  );
}
