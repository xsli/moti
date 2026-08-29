import { createServerFn } from "@tanstack/react-start";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { runCodexJson } from "@/lib/ai/codex";
import { coerceSubject, isErrorReason, type ErrorReason, type Subject } from "@/lib/problems/types";
import { normalizeBBox, type ImageBBox } from "@/lib/image/bbox";

const inputSchema = z.object({
  imageDataUrl: z.string().max(24_000_000).optional(),
  images: z.array(z.string().max(24_000_000)).max(16).optional(),
  imageIds: z.array(z.string().min(8).max(80)).max(16).optional(),
  text: z.string().max(8000).optional(),
  extra: z.string().max(2000).optional(),
  mode: z.enum(["extract", "redraw"]).optional(),
  withAnswer: z.boolean().optional(),
});

export interface ExtractedFigure {
  title: string;
  svg: string;
  caption: string;
  image?: string;
}

export interface ExtractedProblem {
  title: string;
  stem: string;
  subject: Subject;
  tags: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  figures: ExtractedFigure[];
  myAnswer: string;
  correctAnswer: string;
  analysis: string;
  errorHint: string;
  errorReason: ErrorReason;
  bbox?: ImageBBox;
  figureBbox?: ImageBBox;
  sourceIndex?: number;
}

export type ExtractResult =
  | { ok: true; results: ExtractedProblem[] }
  | { ok: false; error: string };

export const EXTRACT_TIMEOUT_MS = 480_000;
export const MAX_CAPTURE_IMAGES = 16;
export const MAX_EXTRACT_PROBLEMS = 40;

const BBOX_SCHEMA = {
  type: "object",
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
  },
  required: ["x", "y", "w", "h"],
  additionalProperties: false,
} as const;

const EXTRACT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    problems: {
      type: "array",
      maxItems: MAX_EXTRACT_PROBLEMS,
      items: {
        type: "object",
        properties: {
          sourceIndex: { type: "integer", minimum: 0 },
          title: { type: "string" },
          stem: { type: "string" },
          subject: {
            type: "string",
            enum: ["algebra", "geometry", "function", "trig", "calculus", "probability", "other"],
          },
          tags: { type: "array", items: { type: "string" }, maxItems: 8 },
          difficulty: { type: "integer", minimum: 1, maximum: 5 },
          bbox: { anyOf: [BBOX_SCHEMA, { type: "null" }] },
          hasFigure: { type: "boolean" },
          figureBbox: { anyOf: [BBOX_SCHEMA, { type: "null" }] },
          figureTitle: { type: "string" },
          figureCaption: { type: "string" },
          correctAnswer: { type: "string" },
          analysis: { type: "string" },
        },
        required: [
          "sourceIndex",
          "title",
          "stem",
          "subject",
          "tags",
          "difficulty",
          "bbox",
          "hasFigure",
          "figureBbox",
          "figureTitle",
          "figureCaption",
          "correctAnswer",
          "analysis",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["problems"],
  additionalProperties: false,
} as const;

const SOLVE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    correctAnswer: { type: "string" },
    analysis: { type: "string" },
  },
  required: ["correctAnswer", "analysis"],
  additionalProperties: false,
} as const;

const LOCATE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    hasFigure: { type: "boolean" },
    figureBbox: { anyOf: [BBOX_SCHEMA, { type: "null" }] },
  },
  required: ["hasFigure", "figureBbox"],
  additionalProperties: false,
} as const;

function systemPrompt(withAnswer: boolean): string {
  const answerFields = withAnswer
    ? `"correctAnswer": "brief correct result with $LaTeX$",
  "analysis": "step-by-step solution with $LaTeX$"`
    : `"correctAnswer": "",
  "analysis": ""`;
  const answerRule = withAnswer
    ? "You MUST solve each problem. Fill correctAnswer and analysis."
    : "Do NOT solve. Leave correctAnswer and analysis as empty strings. Only transcribe the printed stem.";
  return `You are a mathematics teacher who digitizes Chinese exam mistakes.

SPLIT RULES (mandatory):
- Photos may be several pages of the same paper. Read ALL of them.
- If a photo/page contains MULTIPLE distinct problems (第1题/第2题, 1./2., 一、二、, stacked worksheet items), return EACH as its own object.
- Never merge two problems into one stem.
- Sub-questions (1)(2)(3) of the SAME numbered problem stay as ONE object.
- Maximum ${MAX_EXTRACT_PROBLEMS} problems across all photos.

SOURCE PHOTO (mandatory):
- Photos are given in order as 照片 1, 照片 2, …
- Every problem MUST include "sourceIndex": 0-based index of the photo it came from (照片 1 → 0).
- bbox and figureBbox are fractions 0–1 of THAT photo, not the whole batch.

NUMBERING (mandatory):
- Do NOT keep exam item numbers. Strip "第3题", "3.", "3、", "三、", "题3" from title and stem.
- Keep inner sub-labels (1)(2)(3) / （1）（2） that belong to the same problem.

TABLES (mandatory):
- If the problem contains a table, transcribe it as a KaTeX array inside $$...$$, NOT as a figure.
- Use $$\\begin{array}{|c|c|c|} \\hline a & b & c \\\\ \\hline 1 & 2 & 3 \\\\ \\hline \\end{array}$$

FIGURES:
- Do NOT output SVG.
- hasFigure true ONLY if there is a printed geometry figure, function graph, or chart.
- Pure text / algebra / 填空 / 计算 without a diagram: hasFigure false, omit figureBbox, figures [].
- Do NOT treat answer keys, QR codes, watermarks, or Chinese stem text as a figure.
- figureBbox: fractions 0–1 of the source photo, tightly around ONLY the diagram and vertex labels. Typically a corner, never the whole problem.

ANSWER (mandatory):
- ${answerRule}

Each problem object:
{
  "sourceIndex": 0,
  "title": "short Chinese title",
  "stem": "full problem text, mixed Chinese + $LaTeX$",
  "subject": "algebra|geometry|function|trig|calculus|probability|other",
  "tags": ["tag1","tag2"],
  "difficulty": 1-5,
  "bbox": {"x":0,"y":0,"w":1,"h":1},
  "hasFigure": true,
  "figureBbox": {"x":0,"y":0,"w":1,"h":1},
  "figureTitle": "图形",
  "figureCaption": "",
  ${answerFields}
}

bbox is the crop of THAT problem (stem + its figure) inside its source photo. Include generous margin on TOP, LEFT, RIGHT, and BELOW — especially if a diagram sits above the stem. Never cut off the top of a figure, side labels, the last sentence, or the bottom of a figure. figureBbox is only the diagram.
Return ONLY JSON: {"problems":[ ... ]}
`;
}

function clampDifficulty(value: unknown): 1 | 2 | 3 | 4 | 5 {
  const n = Number(value);
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 4;
  return 5;
}

function stripItemNumber(text: string): string {
  let s = text.trim();
  for (let n = 0; n < 3; n++) {
    const next = s
      .replace(/^第\s*[0-9０-９一二三四五六七八九十百]+\s*(?:小)?题\s*[.．、:：)）]?\s*/u, "")
      .replace(/^[0-9０-９]{1,3}\s*[.．、:：]\s*/u, "")
      .replace(/^[一二三四五六七八九十]+[、.．]\s*/u, "")
      .replace(/^题\s*[0-9０-９]+\s*[.．、:：]?\s*/u, "");
    if (next === s) break;
    s = next.trim();
  }
  return s;
}

function normalizeExtracted(raw: unknown): ExtractedProblem {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const figures: ExtractedFigure[] = [];
  if (obj.hasFigure === true) {
    figures.push({
      title: String(obj.figureTitle ?? "图形").slice(0, 80),
      svg: "",
      caption: String(obj.figureCaption ?? "").slice(0, 200),
    });
  }
  const reason = String(obj.errorReason ?? "unknown");
  const title = stripItemNumber(String(obj.title ?? "未命名题目")).slice(0, 80) || "未命名题目";
  const stem = stripItemNumber(String(obj.stem ?? "").trim()) || "（未能识别题干，请手动填写）";
  return {
    title,
    stem,
    subject: coerceSubject(String(obj.subject ?? "other")),
    tags: Array.isArray(obj.tags)
      ? obj.tags.map((t) => String(t).slice(0, 16)).filter(Boolean).slice(0, 8)
      : [],
    difficulty: clampDifficulty(obj.difficulty),
    figures,
    myAnswer: String(obj.myAnswer ?? "").slice(0, 2000),
    correctAnswer: String(obj.correctAnswer ?? "").slice(0, 2000),
    analysis: String(obj.analysis ?? "").slice(0, 8000),
    errorHint: String(obj.errorHint ?? "").slice(0, 800),
    errorReason: (isErrorReason(reason) ? reason : "unknown") as ErrorReason,
    bbox: normalizeBBox(obj.bbox),
    figureBbox: normalizeBBox(obj.figureBbox),
    sourceIndex: Math.max(0, Math.round(Number(obj.sourceIndex) || 0)),
  };
}

function normalizeBatch(raw: unknown): ExtractedProblem[] {
  if (Array.isArray(raw)) return raw.map(normalizeExtracted).slice(0, MAX_EXTRACT_PROBLEMS);
  const obj = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(obj.problems)) return obj.problems.map(normalizeExtracted).slice(0, MAX_EXTRACT_PROBLEMS);
  if (obj.title || obj.stem || obj.figures) return [normalizeExtracted(obj)];
  return [];
}

type ExtractInput = z.infer<typeof inputSchema> & { invalid?: boolean };

type ExtractJob = {
  status: "running" | "done" | "error";
  results?: ExtractedProblem[];
  error?: string;
  startedAt: number;
  abort: AbortController;
  current?: number;
  total?: number;
};

const jobStore = (globalThis as typeof globalThis & {
  __motiExtractJobs?: Map<string, ExtractJob>;
  __motiExtractImages?: Map<string, string>;
});
jobStore.__motiExtractJobs ??= new Map();
jobStore.__motiExtractImages ??= new Map();
const jobs = jobStore.__motiExtractJobs;
const imageBag = jobStore.__motiExtractImages;
const JOB_DIR = "/tmp/moti-extract-jobs";

function persistJob(id: string, job: ExtractJob) {
  try {
    mkdirSync(JOB_DIR, { recursive: true });
    writeFileSync(
      join(JOB_DIR, `${id}.json`),
      JSON.stringify({
        status: job.status,
        results: job.results,
        error: job.error,
        current: job.current,
        total: job.total,
        startedAt: job.startedAt,
      }),
    );
  } catch (error) {
    console.error("[extract] persist job failed", error);
  }
}

function readDiskJob(id: string): {
  status: ExtractJob["status"];
  results?: ExtractedProblem[];
  error?: string;
  current?: number;
  total?: number;
} | null {
  try {
    const path = join(JOB_DIR, `${id}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8")) as ReturnType<typeof readDiskJob>;
  } catch {
    return null;
  }
}

function pruneJobs() {
  const cutoff = Date.now() - EXTRACT_TIMEOUT_MS - 60_000;
  for (const [id, job] of jobs) {
    if (job.startedAt < cutoff) jobs.delete(id);
  }
  for (const [id, _url] of imageBag) {
    // drop images not referenced by a live job after 30 min
    if (!id) imageBag.delete(id);
  }
}

function resolvePhotos(data: ExtractInput): string[] {
  if (data.mode === "redraw") return data.imageDataUrl ? [data.imageDataUrl] : [];
  if (data.imageIds?.length) {
    return data.imageIds
      .map((id) => imageBag.get(id))
      .filter((url): url is string => Boolean(url))
      .slice(0, MAX_CAPTURE_IMAGES);
  }
  if (data.images?.length) return data.images.slice(0, MAX_CAPTURE_IMAGES);
  if (data.imageDataUrl) return [data.imageDataUrl];
  return [];
}

async function runCodexExtract(
  data: ExtractInput,
  signal?: AbortSignal,
  onProgress?: (current: number, total: number) => void,
): Promise<ExtractResult> {
  if (data.invalid) {
    return { ok: false, error: "照片太大或格式不对，请换一张再试。" };
  }

  const photos = resolvePhotos(data);
  if (!photos.length && !data.text) {
    return { ok: false, error: data.imageIds?.length ? "照片在服务器丢了，请再点一次识别。" : "请先拍照或粘贴题目文字" };
  }

  if ((data.mode ?? "extract") !== "redraw" && photos.length > 1) {
    const collected: ExtractedProblem[] = [];
    const errors: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      if (signal?.aborted) break;
      onProgress?.(i + 1, photos.length);
      const one = await runCodexExtract(
        {
          imageDataUrl: photos[i],
          text: i === 0 ? data.text : undefined,
          extra: i === 0 ? data.extra : undefined,
          mode: "extract",
          withAnswer: data.withAnswer,
        },
        signal,
      );
      if (!one.ok) {
        errors.push(one.error);
        continue;
      }
      for (const item of one.results) collected.push({ ...item, sourceIndex: i });
    }
    if (!collected.length) {
      return { ok: false, error: errors[0] || "没有识别到题目，请重试。" };
    }
    return { ok: true, results: collected };
  }

  const mode = data.mode ?? "extract";
  const page = photos[0];
  const withAnswer = Boolean(data.withAnswer);
  const userTextParts: string[] = [];
  if (mode === "redraw") {
    userTextParts.push("只标出这一道题的图形位置。hasFigure true，给出 figureBbox。不要输出 SVG。返回 {\"problems\":[这一道]}。");
  } else if (withAnswer) {
    userTextParts.push(
      "请识别图中的数学题。多道必须拆开。有图则 hasFigure true 并给出 figureBbox（只框图形）。不要输出 SVG。sourceIndex 为 0。同时给出正确答案和解析。",
    );
  } else {
    userTextParts.push(
      "请识别图中的数学题。多道必须拆开。有图则 hasFigure true 并给出 figureBbox（只框图形）。不要输出 SVG。sourceIndex 为 0。不要解题，correctAnswer 和 analysis 必须为空字符串。",
    );
  }
  if (data.text) userTextParts.push(`补充或文字题目：\n${data.text}`);
  if (data.extra) userTextParts.push(`学生备注 / 错解：\n${data.extra}`);

  try {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);
    try {
      const parsed = await runCodexJson<unknown>({
        prompt: `${systemPrompt(withAnswer)}\n\nCURRENT TASK:\n${userTextParts.join("\n\n")}`,
        images: page ? [page] : [],
        outputSchema: EXTRACT_OUTPUT_SCHEMA,
        signal: controller.signal,
      });
      const results = normalizeBatch(parsed);
      if (!results.length) return { ok: false, error: "没有识别到题目，请重试。" };
      return { ok: true, results };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  } catch (error) {
    const aborted =
      (error instanceof Error && error.name === "AbortError") ||
      (error instanceof DOMException && error.name === "AbortError");
    const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    console.error("Codex extract failed", error);
    if (aborted) {
      return { ok: false, error: signal?.aborted ? "已取消识别。" : "识别超时了（8 分钟）。照片还在，请再点一次识别。" };
    }
    if (/timeout|UND_ERR_HEADERS|UND_ERR_BODY|aborted/i.test(msg)) {
      return { ok: false, error: "Codex 看图时间过长，连接中断了。照片还在，请再试一次。" };
    }
    if (/json/i.test(msg)) {
      return { ok: false, error: "识别结果不完整，请再试一次。" };
    }
    return { ok: false, error: "识别中断了，请检查网络后重试。" };
  }
}

export const extractProblem = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = inputSchema.safeParse(input);
    if (parsed.success) {
      return { ...parsed.data, invalid: false };
    }
    return {
      imageDataUrl: undefined,
      images: undefined,
      imageIds: undefined,
      text: undefined,
      extra: undefined,
      mode: "extract" as const,
      invalid: true,
    };
  })
  .handler(async ({ data }): Promise<ExtractResult> => {
    return runCodexExtract(data);
  });

export const solveProblem = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        stem: z.string().min(1).max(8000),
        imageDataUrl: z.string().max(24_000_000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<
    { ok: true; correctAnswer: string; analysis: string } | { ok: false; error: string }
  > => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 180_000);
    try {
      const parsed = await runCodexJson<Record<string, unknown>>({
        prompt:
          "You are a mathematics teacher. Solve the Chinese exam problem below. " +
          "Keep correctAnswer brief and explain the main steps in Chinese with $LaTeX$.\n\n" +
          data.stem,
        images: data.imageDataUrl ? [data.imageDataUrl] : [],
        outputSchema: SOLVE_OUTPUT_SCHEMA,
        signal: abort.signal,
      });
      const correctAnswer = String(parsed.correctAnswer ?? parsed.answer ?? "").trim().slice(0, 2000);
      const analysis = String(parsed.analysis ?? parsed.solution ?? "").trim().slice(0, 8000);
      if (!correctAnswer && !analysis) return { ok: false, error: "没有得到解答，请再试一次。" };
      return { ok: true, correctAnswer, analysis };
    } catch (error) {
      const aborted =
        (error instanceof Error && error.name === "AbortError") ||
        (error instanceof DOMException && error.name === "AbortError");
      console.error("Codex solve failed", error);
      if (aborted) return { ok: false, error: "解答超时了，请再试一次。" };
      return { ok: false, error: "解答中断了，请检查网络后重试。" };
    } finally {
      clearTimeout(timer);
    }
  });

export const stashExtractImage = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ imageDataUrl: z.string().min(32).max(24_000_000) }).parse(input))
  .handler(async ({ data }) => {
    const id = crypto.randomUUID();
    imageBag.set(id, data.imageDataUrl);
    return { ok: true as const, id };
  });

export const startExtractJob = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = inputSchema.safeParse(input);
    if (parsed.success) return { ...parsed.data, invalid: false };
    return {
      imageDataUrl: undefined,
      images: undefined,
      imageIds: undefined,
      text: undefined,
      extra: undefined,
      mode: "extract" as const,
      invalid: true,
    };
  })
  .handler(async ({ data }): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> => {
    pruneJobs();
    if (data.invalid) return { ok: false, error: "照片太大或格式不对，请换一张再试。" };
    const photos = resolvePhotos(data);
    if (!photos.length && !data.text) {
      return { ok: false, error: data.imageIds?.length ? "照片在服务器丢了，请再点一次识别。" : "请先拍照或粘贴题目文字" };
    }
    const jobId = crypto.randomUUID();
    const abort = new AbortController();
    const job: ExtractJob = {
      status: "running",
      startedAt: Date.now(),
      abort,
      current: 1,
      total: Math.max(1, photos.length),
    };
    jobs.set(jobId, job);
    persistJob(jobId, job);
    void runCodexExtract(data, abort.signal, (current, total) => {
      const live = jobs.get(jobId);
      if (live && live.status === "running") {
        live.current = current;
        live.total = total;
        persistJob(jobId, live);
      }
    }).then((result) => {
      const current = jobs.get(jobId);
      if (!current || current.status !== "running") return;
      if (result.ok) {
        current.status = "done";
        current.results = result.results;
      } else {
        current.status = "error";
        current.error = result.error;
      }
      persistJob(jobId, current);
      if (data.imageIds) {
        for (const id of data.imageIds) imageBag.delete(id);
      }
    });
    return { ok: true, jobId };
  });

export const pollExtractJob = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ jobId: z.string().min(8).max(80) }).parse(input))
  .handler(async ({ data }): Promise<
    | { status: "running"; current?: number; total?: number; startedAt?: number }
    | { status: "done"; results: ExtractedProblem[] }
    | { status: "error"; error: string }
  > => {
    const job = jobs.get(data.jobId);
    if (!job) {
      const disk = readDiskJob(data.jobId);
      if (disk?.status === "done") return { status: "done", results: disk.results ?? [] };
      if (disk?.status === "error") return { status: "error", error: disk.error || "识别失败" };
      if (disk?.status === "running") {
        return { status: "error", error: "识别任务中断了，照片还在，请再点一次识别。" };
      }
      return { status: "error", error: "识别任务丢了，请再点一次识别。" };
    }
    if (job.status === "done") return { status: "done", results: job.results ?? [] };
    if (job.status === "error") return { status: "error", error: job.error || "识别失败" };
    return { status: "running", current: job.current, total: job.total, startedAt: job.startedAt };
  });

export const cancelExtractJob = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ jobId: z.string().min(8).max(80) }).parse(input))
  .handler(async ({ data }) => {
    const job = jobs.get(data.jobId);
    if (job?.status === "running") {
      job.abort.abort();
      job.status = "error";
      job.error = "已取消识别。";
      persistJob(data.jobId, job);
    }
    return { ok: true as const };
  });

const LOCATE_PROMPT = `This is a crop of ONE Chinese math problem. Locate the printed diagram only.

Return JSON only:
{"hasFigure": true, "figureBbox": {"x":0.0,"y":0.0,"w":0.4,"h":0.5}}

Rules:
- x,y,w,h are fractions of THIS image (0–1).
- Box tightly around the geometry / function graph / chart AND its vertex labels or axis ticks.
- Exclude Chinese problem text, other problems, blank margins, student handwriting, QR codes.
- Do not return the full image unless this crop is already only the diagram.
- If there is no diagram: {"hasFigure": false}`;

export const locateFigure = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ imageDataUrl: z.string().min(32).max(2_800_000) }).parse(input))
  .handler(
    async ({ data }): Promise<{ ok: true; bbox?: ImageBBox } | { ok: false; error: string }> => {
      try {
        const parsed = await runCodexJson<Record<string, unknown>>({
          prompt: `${LOCATE_PROMPT}\n\n标出图形框。`,
          images: [data.imageDataUrl],
          outputSchema: LOCATE_OUTPUT_SCHEMA,
        });
        if (parsed.hasFigure === false) return { ok: true };
        const bbox = normalizeBBox(parsed.figureBbox ?? parsed.bbox, 0.04);
        return { ok: true, bbox };
      } catch (error) {
        console.error("locate figure failed", error);
        return { ok: false, error: "定位中断" };
      }
    },
  );
