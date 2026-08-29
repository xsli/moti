import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, Pencil, Sparkles, Scissors, Trash2 } from "lucide-react";
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
import { solveProblem } from "@/lib/ai/extract";
import type { ImageBBox } from "@/lib/image/bbox";
import { cropDataUrl } from "@/lib/image/compress";
import { formatLoggedDateLong } from "@/lib/problems/dates";
import { usePaperStore } from "@/lib/paper/store";
import { MathText } from "@/lib/problems/math-text";
import { useProblemStore } from "@/lib/problems/store";
import {
  MASTERY_LABEL,
  SUBJECT_LABEL,
  type Mastery,
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
  const problems = useProblemStore((s) => s.problems);
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const item of problems) for (const tag of item.tags) set.add(tag);
    return [...set];
  }, [problems]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropBox, setCropBox] = useState<ImageBBox>({ x: 0.38, y: 0.26, w: 0.58, h: 0.6 });
  const cropBoxRef = useRef(cropBox);
  const [cropping, setCropping] = useState(false);
  const [solving, setSolving] = useState(false);
  const noteValue = notes ?? problem.notes;
  const hasAnswer = Boolean(problem.correctAnswer.trim());
  const parentGroupId = problem.collectionId || "ungrouped";

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
      const current = problem.figures[0];
      await updateProblem(problem.id, {
        figures: [
          {
            id: current?.id ?? crypto.randomUUID(),
            title: current?.title ?? "图形",
            caption: current?.caption ?? "",
            svg: "",
            image: cropped,
          },
        ],
      });
      setCropOpen(false);
      toast.success("已用框选原图");
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
          <Badge variant={problem.mastery === "mastered" ? "mastered" : "outline"}>
            {MASTERY_LABEL[problem.mastery]}
          </Badge>
        </div>
        <div className="px-5 py-5 sm:px-6">
          <EditableTitle
            value={problem.title}
            onSave={(title) => void updateProblem(problem.id, { title })}
          />
          <p className="mt-2 text-sm text-muted-foreground">录入 {formatLoggedDateLong(problem.createdAt)}</p>
          <div className="mt-4">
            <CollectionPicker
              value={problem.collectionId ?? ""}
              onChange={(id) => void updateProblem(problem.id, { collectionId: id || undefined })}
            />
          </div>
          <div className="mt-4">
            <EditableMath
              value={problem.stem}
              placeholder="题干"
              previewClass="text-lg"
              tall
              onSave={(stem) => void updateProblem(problem.id, { stem })}
            />
          </div>
          <div className="mt-5">
            <p className="mb-2 text-xs tracking-wider text-muted-foreground">标签</p>
            <TagEditor
              tags={problem.tags}
              suggestions={allTags}
              onChange={(tags) => void updateProblem(problem.id, { tags })}
            />
          </div>
        </div>
        {problem.figures.map((fig) => (
          <div key={fig.id} className="border-t border-border">
            <FigureFrame svg={fig.svg} image={fig.image} caption={fig.caption || fig.title} />
          </div>
        ))}
        {problem.sourceImage ? (
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button variant="ghost" size="sm" onClick={() => setCropOpen(true)}>
              <Scissors className="size-4" />
              框选图形
            </Button>
          </div>
        ) : null}
      </article>

      <Panel
        title="答案"
        action={
          !hasAnswer ? (
            <Button size="sm" variant="outline" onClick={() => void askGrok()} disabled={solving}>
              {solving ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {solving ? "正在解答…" : "AI 解答"}
            </Button>
          ) : null
        }
      >
        {solving && !hasAnswer ? (
          <p className="text-sm text-muted-foreground">Grok 正在做这道题…</p>
        ) : (
          <EditableMath
            value={problem.correctAnswer}
            placeholder="正确答案"
            onSave={(correctAnswer) => void updateProblem(problem.id, { correctAnswer })}
          />
        )}
      </Panel>

      <Panel title="解析">
        {solving && !problem.analysis.trim() ? (
          <p className="text-sm text-muted-foreground">解析生成后会出现在这里。</p>
        ) : (
          <EditableMath
            value={problem.analysis}
            placeholder="解析"
            tall
            onSave={(analysis) => void updateProblem(problem.id, { analysis })}
          />
        )}
      </Panel>

      <Panel title="掌握程度">
        <div className="flex flex-wrap gap-2">
          {(["new", "reviewing", "mastered"] as Mastery[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => void updateProblem(problem.id, { mastery: m })}
              className={cn(
                "h-10 rounded-full px-4 text-sm transition-colors",
                problem.mastery === m ? "bg-fg text-primary-foreground" : "bg-secondary text-muted-foreground",
              )}
            >
              {MASTERY_LABEL[m]}
            </button>
          ))}
        </div>
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
            <DialogDescription>只圈图形，用这块原图。</DialogDescription>
          </DialogHeader>
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
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium tracking-wider text-muted-foreground">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
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
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-fg"
        onClick={onEdit}
      >
        <Pencil className="size-3" />
        修改
      </button>
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
        <h1 className="min-w-0 flex-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{value}</h1>
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

function EditableMath({
  value,
  onSave,
  placeholder,
  tall,
  previewClass,
}: {
  value: string;
  onSave: (next: string) => void;
  placeholder: string;
  tall?: boolean;
  previewClass?: string;
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
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
      {editing ? (
        <>
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
              <MathText text={draft} className={previewClass} />
            ) : (
              <p className="text-sm text-muted-foreground">（空）</p>
            )}
          </div>
        </>
      ) : value.trim() ? (
        <MathText text={value} className={previewClass} />
      ) : (
        <p className="text-sm text-muted-foreground">（未填写）</p>
      )}
    </div>
  );
}
