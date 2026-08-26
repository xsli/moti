import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ImagePlus, LoaderCircle, Type, Upload, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConstructionLoader } from "@/components/capture/construction-loader";
import { CollectionPicker } from "@/components/notebook/collection-picker";
import { CropEditor } from "@/components/notebook/crop-editor";
import { FigureFrame } from "@/components/notebook/figure-frame";
import { TagEditor } from "@/components/notebook/tag-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelExtractJob,
  extractProblem,
  MAX_CAPTURE_IMAGES,
  pollExtractJob,
  stashExtractImage,
  startExtractJob,
  type ExtractedProblem,
} from "@/lib/ai/extract";
import {
  clearCaptureHold,
  loadCaptureHold,
  persistCaptureHold,
  writeCaptureHold,
} from "@/lib/capture/hold";
import { cropDataUrl, dataUrlForGrok, fileToDataUrl } from "@/lib/image/compress";
import type { ImageBBox } from "@/lib/image/bbox";
import { MathText } from "@/lib/problems/math-text";
import { useProblemStore } from "@/lib/problems/store";
import {
  SUBJECT_LABEL,
  SUBJECTS,
  type Subject,
} from "@/lib/problems/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/capture")({ component: CapturePage });

type Stage = "idle" | "loading" | "review";

type ExtractProgress = {
  phase: "upload" | "recognize";
  current: number;
  total: number;
  startedAt: number;
};

type DraftItem = ExtractedProblem & { sourceImage?: string };

function defaultCropBox(hint?: ImageBBox): ImageBBox {
  if (hint && hint.w * hint.h <= 0.6) return hint;
  return { x: 0.38, y: 0.26, w: 0.58, h: 0.6 };
}

function waitForJob(
  jobId: string,
  signal: AbortSignal,
  onProgress?: (info: { current: number; total: number; startedAt: number }) => void,
): Promise<ExtractedProblem[]> {
  return new Promise((resolve, reject) => {
    let poll = 0;
    const fail = () => {
      window.clearInterval(poll);
      void cancelExtractJob({ data: { jobId } });
      reject(new DOMException("cancelled", "AbortError"));
    };
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
    const tick = () => {
      void pollExtractJob({ data: { jobId } }).then((state) => {
        if (state.status === "running") {
          onProgress?.({
            current: state.current ?? 1,
            total: state.total ?? 1,
            startedAt: state.startedAt ?? Date.now(),
          });
          return;
        }
        window.clearInterval(poll);
        signal.removeEventListener("abort", fail);
        if (state.status === "done") resolve(state.results);
        else reject(new Error(state.error));
      }, reject);
    };
    tick();
    poll = window.setInterval(tick, 1500);
  });
}

function CapturePage() {
  const navigate = useNavigate();
  const addProblem = useProblemStore((s) => s.addProblem);
  const problems = useProblemStore((s) => s.problems);
  const collections = useProblemStore((s) => s.collections);
  const userId = useProblemStore((s) => s.userId);
  const [collectionId, setCollectionId] = useState("");
  const notebookTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of problems) for (const t of p.tags) set.add(t);
    return [...set];
  }, [problems]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [images, setImages] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [withAnswer, setWithAnswer] = useState(false);
  const extractAbort = useRef<AbortController | null>(null);
  const jobIdRef = useRef("");
  const restored = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setWithAnswer(window.localStorage.getItem("moti-extract-with-answer") === "1");
  }, []);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const last = window.localStorage.getItem(`moti-last-collection:${userId}`) ?? "";
    if (last && !jobIdRef.current) setCollectionId((cur) => cur || last);
  }, [userId]);

  useEffect(() => {
    let live = true;
    void loadCaptureHold().then((hold) => {
      if (!live) return;
      restored.current = true;
      if (!hold) return;
      if (hold.collectionId) setCollectionId(hold.collectionId);
      if (hold.images.length) setImages(hold.images);
      if (hold.text) setText(hold.text);
      if (hold.drafts.length && hold.stage === "review") {
        setDrafts(hold.drafts);
        setIndex(hold.index);
        setStage("review");
        return;
      }
      if (hold.jobId && hold.stage === "loading") {
        jobIdRef.current = hold.jobId;
        void continueJobRef.current(hold.jobId, hold.images);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    writeCaptureHold({
      images,
      text,
      collectionId,
      drafts,
      index,
      stage,
      jobId: jobIdRef.current,
    });
    const timer = window.setTimeout(() => void persistCaptureHold(), 400);
    return () => window.clearTimeout(timer);
  }, [images, text, collectionId, drafts, index, stage]);

  function pickCollection(id: string) {
    setCollectionId(id);
    if (userId && typeof window !== "undefined") {
      window.localStorage.setItem(`moti-last-collection:${userId}`, id);
    }
  }

  async function applyExtracted(photos: string[], result: ExtractedProblem[]) {
    const collected: DraftItem[] = [];
    for (const item of result) {
      const photo = photos[Math.min(item.sourceIndex ?? 0, Math.max(0, photos.length - 1))] ?? photos[0];
      let sourceImage = photo;
      if (photo && item.bbox) {
        try {
          sourceImage = await cropDataUrl(photo, item.bbox, { x: 0.1, y: 0.12, bottom: 0.14 });
        } catch {
          sourceImage = photo;
        }
      }
      collected.push({
        ...item,
        sourceImage,
        figures: item.figures.map((fig) => ({ ...fig, svg: "", image: undefined })),
      });
    }
    if (!collected.length) {
      toast.error("没有识别到题目。照片还在，可以再点识别。");
      setStage("idle");
      return;
    }
    setDrafts(collected);
    setIndex(0);
    setStage("review");
    jobIdRef.current = "";
  }

  async function continueJob(jobId: string, photos: string[]) {
    const ac = new AbortController();
    extractAbort.current = ac;
    setStage("loading");
    const startedAt = Date.now();
    setProgress({
      phase: "recognize",
      current: 1,
      total: Math.max(1, photos.length),
      startedAt,
    });
    setBusy(true);
    try {
      const result = await waitForJob(jobId, ac.signal, (info) => {
        setProgress({
          phase: "recognize",
          current: info.current,
          total: info.total,
          startedAt: info.startedAt || startedAt,
        });
      });
      await applyExtracted(photos, result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.message("已取消识别，照片还在。");
      } else if (/丢了|没有识别/.test(msg)) {
        toast.error(msg || "识别还没接上，照片还在，请再点识别。");
      } else {
        toast.error(msg || "识别中断了。照片还在，请再点一次识别。");
      }
      setStage("idle");
      jobIdRef.current = "";
    } finally {
      setBusy(false);
      extractAbort.current = null;
    }
  }

  const continueJobRef = useRef(continueJob);
  continueJobRef.current = continueJob;

  async function onFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    const next: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/") && file.type !== "") continue;
      try {
        next.push(await fileToDataUrl(file));
      } catch {
        toast.error(`${file.name || "图片"} 无法读取`);
      }
    }
    if (!next.length) {
      toast.error("请选择 JPG 或 PNG 图片。");
      return;
    }
    setImages((prev) => [...prev, ...next].slice(0, MAX_CAPTURE_IMAGES));
  }

  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    if (stage !== "idle") return;
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data) return;
      const files: File[] = [];
      for (const file of Array.from(data.files ?? [])) {
        if (file.type.startsWith("image/")) files.push(file);
      }
      if (!files.length) {
        for (const item of Array.from(data.items ?? [])) {
          if (item.kind === "file" && item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      }
      if (!files.length) return;
      event.preventDefault();
      void onFilesRef.current(files).then(() => {
        toast.success(files.length > 1 ? `已粘贴 ${files.length} 张` : "已粘贴图片");
      });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [stage]);

  async function runExtract() {
    if (!images.length && !text.trim()) {
      toast.error("请先拍照，或粘贴题目文字。");
      return;
    }
    const ac = new AbortController();
    extractAbort.current = ac;
    setStage("loading");
    const startedAt = Date.now();
    setProgress({
      phase: images.length ? "upload" : "recognize",
      current: 1,
      total: Math.max(1, images.length),
      startedAt,
    });
    setBusy(true);
    try {
      const imageIds: string[] = [];
      for (let i = 0; i < images.length; i++) {
        if (ac.signal.aborted) throw new DOMException("cancelled", "AbortError");
        setProgress({
          phase: "upload",
          current: i + 1,
          total: images.length,
          startedAt,
        });
        let forGrok = images[i];
        try {
          forGrok = await dataUrlForGrok(images[i]);
        } catch {
          forGrok = images[i];
        }
        const stashed = await stashExtractImage({ data: { imageDataUrl: forGrok } });
        imageIds.push(stashed.id);
      }
      setProgress({
        phase: "recognize",
        current: 1,
        total: Math.max(1, images.length),
        startedAt,
      });
      const started = await startExtractJob({
        data: {
          imageIds: imageIds.length ? imageIds : undefined,
          text: text.trim() || undefined,
          mode: "extract",
          withAnswer,
        },
      });
      if (!started.ok) {
        toast.error(started.error);
        setStage("idle");
        return;
      }
      jobIdRef.current = started.jobId;
      writeCaptureHold({ jobId: started.jobId, images, text, collectionId, stage: "loading" });
      void persistCaptureHold();
      const result = await waitForJob(started.jobId, ac.signal, (info) => {
        setProgress({
          phase: "recognize",
          current: info.current,
          total: info.total,
          startedAt: info.startedAt || startedAt,
        });
      });
      await applyExtracted(images, result);
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "";
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.message("已取消识别，照片还在。");
      } else if (/unauthorized/i.test(msg)) toast.error("登录失效了，请刷新后再试。");
      else if (/too (big|large)|payload|2800000|1500000|413/i.test(msg)) {
        toast.error("照片太大，请换一张或先裁小再识别。");
      } else {
        toast.error(msg || "识别中断了。照片还在，请再点一次识别。");
      }
      setStage("idle");
    } finally {
      setBusy(false);
      extractAbort.current = null;
    }
  }

  function cancelExtract() {
    extractAbort.current?.abort();
  }

  function applyBatchTags(next: string[]) {
    const lists = drafts.map((d) => d.tags);
    const common = lists.length ? lists.reduce((a, b) => a.filter((t) => b.includes(t))) : [];
    const added = next.filter((t) => !common.includes(t));
    const removed = common.filter((t) => !next.includes(t));
    setDrafts((prev) =>
      prev.map((item) => {
        let tags = item.tags.filter((t) => !removed.includes(t));
        for (const tag of added) {
          if (!tags.includes(tag)) tags = [...tags, tag].slice(0, 8);
        }
        return { ...item, tags };
      }),
    );
  }

  const batchCommonTags = useMemo(() => {
    if (!drafts.length) return [];
    return drafts.map((d) => d.tags).reduce((a, b) => a.filter((t) => b.includes(t)));
  }, [drafts]);

  const captureSuggestions = useMemo(() => {
    const set = new Set(notebookTags);
    for (const item of drafts) for (const tag of item.tags) set.add(tag);
    return [...set];
  }, [notebookTags, drafts]);

  function patchDraft(partial: Partial<DraftItem>) {
    setDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, ...partial } : item)));
  }

  async function saveOne(item: DraftItem): Promise<string> {
    return addProblem({
      sourceKind: item.sourceImage ? "photo" : "text",
      sourceImage: item.sourceImage,
      title: item.title,
      stem: item.stem,
      figures: item.figures.map((fig) => ({
        ...fig,
        id: crypto.randomUUID(),
      })),
      subject: item.subject,
      tags: item.tags,
      difficulty: item.difficulty,
      myAnswer: "",
      correctAnswer: item.correctAnswer,
      analysis: item.analysis,
      notes: "",
      errorReason: "unknown",
      mastery: "new",
      reviewCount: 0,
      nextReviewAt: Date.now(),
      collectionId: collectionId || undefined,
    });
  }

  async function saveCurrent() {
    const item = drafts[index];
    if (!item) return;
    try {
      await saveOne(item);
      const remain = drafts.filter((_, i) => i !== index);
      toast.success(collectionLabel());
      if (!remain.length) {
        resetForMore();
        return;
      }
      setDrafts(remain);
      setIndex(Math.min(index, remain.length - 1));
    } catch {
      /* store already toasted */
    }
  }

  function collectionLabel() {
    const name = collections.find((item) => item.id === collectionId)?.name;
    return name ? `已收入「${name}」` : "已收入本子";
  }

  function backToRecapture() {
    setDrafts([]);
    setIndex(0);
    setStage("idle");
    jobIdRef.current = "";
    writeCaptureHold({
      images,
      text,
      collectionId,
      drafts: [],
      index: 0,
      stage: "idle",
      jobId: "",
    });
    void persistCaptureHold();
  }

  function resetForMore() {
    setDrafts([]);
    setImages([]);
    setText("");
    setIndex(0);
    setStage("idle");
    jobIdRef.current = "";
    void clearCaptureHold();
  }

  async function saveAll() {
    if (!drafts.length) return;
    setBusy(true);
    try {
      for (const item of drafts) {
        await saveOne(item);
      }
      toast.success(`${collectionLabel()}，${drafts.length} 道。可继续拍`);
      resetForMore();
    } catch {
      /* store already toasted */
    } finally {
      setBusy(false);
    }
  }

  async function reExtractCurrent() {
    const current = drafts[index];
    if (!current) return;
    if (!current.sourceImage && !current.stem) {
      toast.error("这一题没有图也没有文字，无法重新识别。");
      return;
    }
    setStage("loading");
    const startedAt = Date.now();
    setProgress({ phase: "recognize", current: 1, total: 1, startedAt });
    setBusy(true);
    try {
      const result = await extractProblem({
        data: {
          imageDataUrl: current.sourceImage,
          text: current.stem || undefined,
          mode: "extract",
          withAnswer,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        setStage("review");
        return;
      }
      const next = result.results[0];
      if (!next) {
        toast.error("没有识别到内容。");
        setStage("review");
        return;
      }
      setDrafts((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...next,
                sourceImage: current.sourceImage,
                bbox: current.bbox,
                figures: next.figures.map((fig) => ({ ...fig, svg: "", image: undefined })),
              }
            : item,
        ),
      );
      setStage("review");
    } catch {
      toast.error("识别中断了，请再试一次。");
      setStage("review");
    } finally {
      setBusy(false);
    }
  }

  const draft = drafts[index];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-sm font-medium tracking-wide text-primary">收录</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">拍下错题</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          先选组，再连续拍。多张试卷一次识别。多道题会自动拆开。
        </p>
        <div className="mt-4">
          <CollectionPicker value={collectionId} onChange={pickCollection} />
        </div>
      </div>

      {stage === "loading" ? (
        <ConstructionLoader
          phase={progress?.phase ?? "recognize"}
          current={progress?.current ?? 1}
          total={progress?.total ?? Math.max(1, images.length)}
          startedAt={progress?.startedAt ?? Date.now()}
          withAnswer={withAnswer}
          onCancel={cancelExtract}
        />
      ) : null}

      {stage === "idle" ? (
        <div className="flex flex-col gap-6">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void onFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border bg-surface",
            )}
          >
            {images.length ? (
              <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
                {images.map((src, i) => (
                  <span key={`${src.slice(-24)}-${i}`} className="relative">
                    <img
                      src={src}
                      alt={`待识别 ${i + 1}`}
                      className="h-36 w-full rounded-lg object-contain bg-secondary outline outline-1 -outline-offset-1 outline-fg/10"
                    />
                    <span
                      role="button"
                      tabIndex={0}
                      className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-fg/80 text-primary-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImages((prev) => prev.filter((_, idx) => idx !== i));
                      }}
                    >
                      <X className="size-3.5" />
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <>
                <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
                  <ImagePlus className="size-5 text-primary" />
                </span>
                <span className="font-display text-lg font-semibold">拍照、粘贴或拖入试卷</span>
                <span className="text-sm text-muted-foreground">
                  复制截图后按 Ctrl+V / ⌘V 即可。一次最多 {MAX_CAPTURE_IMAGES} 张，一页多题会自动分开。
                </span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            suppressHydrationWarning
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="stem-text" className="inline-flex items-center gap-1.5">
              <Type className="size-3.5" />
              没有图也可以先贴文字
            </Label>
            <Textarea
              id="stem-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="粘贴题目。若照片里有图，文字可作为补充。"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={withAnswer}
              onChange={(e) => {
                const next = e.target.checked;
                setWithAnswer(next);
                window.localStorage.setItem("moti-extract-with-answer", next ? "1" : "0");
              }}
            />
            同时生成答案和解析（更慢）
          </label>
          <Button size="lg" onClick={() => void runExtract()} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : null}
            {images.length > 1 ? `一次识别 ${images.length} 张` : "识别题干"}
          </Button>
          {collectionId ? (
            <Button variant="ghost" onClick={() => void navigate({ to: "/", search: { g: collectionId } })}>
              回这一组
            </Button>
          ) : null}
        </div>
      ) : null}

      {stage === "review" && draft ? (
        <div className="flex flex-col gap-5">
          {drafts.length > 1 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                拆成 {drafts.length} 道，正在看第 {index + 1} 道。每题单独一张图。
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {drafts.map((item, i) => (
                  <button
                    key={`${item.title}-${i}`}
                    type="button"
                    onClick={() => setIndex(i)}
                    className={cn(
                      "shrink-0 overflow-hidden rounded-lg outline outline-1 -outline-offset-1 transition-colors",
                      i === index ? "outline-primary" : "outline-fg/10",
                    )}
                  >
                    {item.sourceImage ? (
                      <img src={item.sourceImage} alt="" className="h-16 w-24 object-cover bg-secondary" />
                    ) : (
                      <span className="grid h-16 w-24 place-items-center bg-secondary text-xs">
                        {i + 1}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
              <p className="text-sm font-medium">本批一起打标签</p>
              <p className="mt-0.5 text-xs text-muted-foreground">加在这里会进每一道；单题还可再改。</p>
              <div className="mt-3">
                <TagEditor
                  tags={batchCommonTags}
                  suggestions={captureSuggestions}
                  placeholder="例如：期末、函数"
                  onChange={applyBatchTags}
                />
              </div>
            </div>
          </div>
        ) : null}
          <ReviewForm
            key={index}
            draft={draft}
            image={draft.sourceImage}
            suggestions={captureSuggestions}
            onChange={patchDraft}
            onSave={saveCurrent}
            onSaveAll={drafts.length > 1 ? saveAll : undefined}
            onRetry={reExtractCurrent}
            onBack={backToRecapture}
            busy={busy}
          />
        </div>
      ) : null}
    </div>
  );
}

function ReviewForm({
  draft,
  image,
  suggestions = [],
  onChange,
  onSave,
  onSaveAll,
  onRetry,
  onBack,
  busy,
}: {
  draft: ExtractedProblem;
  image?: string;
  suggestions?: string[];
  onChange: (next: Partial<ExtractedProblem>) => void;
  onSave: () => void;
  onSaveAll?: () => void;
  onRetry: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  const figureCount = draft.figures.length;
  const difficultyDots = useMemo(() => [1, 2, 3, 4, 5] as const, []);
  const [needCrop, setNeedCrop] = useState(figureCount > 0);
  const cropBox = draft.figureBbox ?? defaultCropBox();

  function commitCrop(box: ImageBBox) {
    if (!image) {
      onChange({ figureBbox: box });
      return;
    }
    void cropDataUrl(image, box, 0).then((dataUrl) => {
      const base = draft.figures[0] ?? { title: "图形", svg: "", caption: "" };
      onChange({
        figureBbox: box,
        figures: [{ ...base, svg: "", image: dataUrl }],
      });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">识别结果，可改</p>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="标题">
            <Input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} />
          </Field>
          <Field label="题干（可用 $公式$）">
            <Textarea
              value={draft.stem}
              onChange={(e) => onChange({ stem: e.target.value })}
              className="min-h-32"
            />
            <div className="rounded-md bg-secondary/60 px-3 py-2">
              <MathText text={draft.stem} className="text-sm" />
            </div>
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">这道题的标签</span>
            <TagEditor
              tags={draft.tags}
              suggestions={suggestions}
              placeholder="例如：相似、二次函数"
              onChange={(tags) => onChange({ tags })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">科目</span>
            <div className="flex flex-wrap gap-1.5">
              {SUBJECTS.map((s) => (
                <Chip key={s} active={draft.subject === s} onClick={() => onChange({ subject: s as Subject })}>
                  {SUBJECT_LABEL[s]}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">难度</span>
            <div className="flex gap-2">
              {difficultyDots.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`难度 ${n}`}
                  onClick={() => onChange({ difficulty: n })}
                  className={cn(
                    "size-3.5 rounded-full transition-colors",
                    n <= draft.difficulty ? "bg-primary" : "bg-rule",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
        <p className="border-b border-border px-4 py-2 text-xs font-medium tracking-wider text-muted-foreground">
          图形 · 自己框选原图
        </p>
        {image && needCrop ? (
          <div className="p-3">
            {draft.figures[0]?.image ? (
              <div className="mb-3 overflow-hidden rounded-lg">
                <FigureFrame svg="" image={draft.figures[0].image} caption="裁切预览" />
              </div>
            ) : null}
            <CropEditor src={image} value={cropBox} onCommit={commitCrop} />
            <p className="mt-2 text-xs text-muted-foreground">拖动框只圈图形，松手后按这个范围裁，不再外扩。</p>
          </div>
        ) : image ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8">
            <p className="text-sm text-muted-foreground">这道题没有图形。</p>
            <Button type="button" size="sm" variant="outline" onClick={() => setNeedCrop(true)}>
              我来框选图形
            </Button>
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">没有原图可裁。</p>
        )}
      </div>

      <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-5">
        <div className="flex flex-col gap-4">
          <PreviewField label="正确答案" value={draft.correctAnswer} onChange={(v) => onChange({ correctAnswer: v })} />
          <PreviewField label="解析" value={draft.analysis} onChange={(v) => onChange({ analysis: v })} tall />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          返回重拍
        </Button>
        <Button variant="outline" onClick={onRetry} disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : null}
          重新识别这一题
        </Button>
        {onSaveAll ? (
          <Button variant="secondary" onClick={onSaveAll} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : null}
            全部收入本组
          </Button>
        ) : null}
        <Button onClick={onSave} disabled={busy}>
          保存这一题
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function PreviewField({
  label,
  value,
  onChange,
  tall,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  tall?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-fg"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "完成" : "修改"}
        </button>
      </div>
      {editing ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={tall ? "min-h-32" : undefined}
        />
      ) : (
        <div className="rounded-md bg-secondary/60 px-3 py-3">
          {value.trim() ? (
            <MathText text={value} className="text-sm" />
          ) : (
            <p className="text-sm text-muted-foreground">（空）</p>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded-full px-3 text-sm transition-colors",
        active ? "bg-fg text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
