import { authMiddleware } from "@/lib/auth/middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { coerceSubject, isErrorReason, type ErrorReason, type Subject } from "@/lib/problems/types";
import { normalizeBBox, type ImageBBox } from "@/lib/image/bbox";

const inputSchema = z.object({
  imageDataUrl: z.string().max(16_000_000).optional(),
  text: z.string().max(8000).optional(),
  extra: z.string().max(2000).optional(),
  mode: z.enum(["extract", "redraw"]).optional(),
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
}

export type ExtractResult =
  | { ok: true; results: ExtractedProblem[] }
  | { ok: false; error: string };

export const EXTRACT_TIMEOUT_MS = 180_000;

const SYSTEM_PROMPT = `You are a mathematics teacher who digitizes Chinese exam mistakes.

SPLIT RULES (mandatory):
- If the photo/page contains MULTIPLE distinct problems (第1题/第2题, 1./2., 一、二、, stacked worksheet items), return EACH as its own object.
- Never merge two problems into one stem.
- Sub-questions (1)(2)(3) of the SAME numbered problem stay as ONE object.
- Maximum 16 problems.

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
- figureBbox: fractions 0–1 of the FULL photo, tightly around ONLY the diagram and vertex labels. Typically a corner, never the whole problem.

Each problem object:
{
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
  "correctAnswer": "brief correct result with $LaTeX$",
  "analysis": "step-by-step solution with $LaTeX$"
}

bbox is the crop of THAT problem (stem + its figure). Include generous margin on TOP, LEFT, RIGHT, and BELOW — especially if a diagram sits above the stem. Never cut off the top of a figure, side labels, the last sentence, or the bottom of a figure. figureBbox is only the diagram.
Return ONLY JSON: {"problems":[ ... ]}
`;

function parseJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : trimmed;
  const objStart = raw.indexOf("{");
  const arrStart = raw.indexOf("[");
  const start =
    objStart < 0 ? arrStart : arrStart < 0 ? objStart : Math.min(objStart, arrStart);
  if (start < 0) throw new Error("模型未返回 JSON");
  if (raw[start] === "[") {
    const end = raw.lastIndexOf("]");
    if (end <= start) throw new Error("模型未返回 JSON");
    return JSON.parse(raw.slice(start, end + 1));
  }
  const end = raw.lastIndexOf("}");
  if (end <= start) throw new Error("模型未返回 JSON");
  return JSON.parse(raw.slice(start, end + 1));
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
  };
}

function normalizeBatch(raw: unknown): ExtractedProblem[] {
  if (Array.isArray(raw)) return raw.map(normalizeExtracted).slice(0, 16);
  const obj = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(obj.problems)) return obj.problems.map(normalizeExtracted).slice(0, 16);
  if (obj.title || obj.stem || obj.figures) return [normalizeExtracted(obj)];
  return [];
}

export const extractProblem = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return { imageDataUrl: undefined, text: undefined, extra: undefined, mode: "extract" as const, invalid: true };
    }
    return { ...parsed.data, invalid: false };
  })
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<ExtractResult> => {
    if ((data as { invalid?: boolean }).invalid) {
      return { ok: false, error: "照片太大或格式不对，请换一张再试。" };
    }
    if (!data.imageDataUrl && !data.text) {
      return { ok: false, error: "请先拍照或粘贴题目文字" };
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "当前环境暂未开通识别能力，请稍后再试，或改为手动录入。" };
    }

    const mode = data.mode ?? "extract";
    const userTextParts: string[] = [];
    if (mode === "redraw") {
      userTextParts.push("只标出这一道题的图形位置。hasFigure true，给出 figureBbox。不要输出 SVG。返回 {\"problems\":[这一道]}。");
    } else {
      userTextParts.push(
        "请识别图中的数学题。多道必须拆开。有图则 hasFigure true 并给出 figureBbox（只框图形）。不要输出 SVG。",
      );
    }
    if (data.text) userTextParts.push(`补充或文字题目：\n${data.text}`);
    if (data.extra) userTextParts.push(`学生备注 / 错解：\n${data.extra}`);

    const content: Array<Record<string, unknown>> = [];
    if (data.imageDataUrl) {
      content.push({
        type: "image_url",
        image_url: { url: data.imageDataUrl, detail: "high" },
      });
    }
    content.push({ type: "text", text: userTextParts.join("\n\n") });

    const body = {
      model: "grok-4.5",
      temperature: 0.15,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        if (res.status === 429) {
          return { ok: false, error: "识别繁忙，请稍后再试。" };
        }
        console.error("xAI extract error", res.status, errText.slice(0, 400));
        return { ok: false, error: "识别失败，请换一张更清晰的题目照片。" };
      }

      const payload = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = payload.choices?.[0]?.message?.content ?? "";
      if (!text) return { ok: false, error: "没有识别到内容，请重试。" };
      const parsed = parseJsonValue(text);
      const results = normalizeBatch(parsed);
      if (!results.length) return { ok: false, error: "没有识别到题目，请重试。" };
      return { ok: true, results };
    } catch (error) {
      const aborted =
        (error instanceof Error && error.name === "AbortError") ||
        (error instanceof DOMException && error.name === "AbortError");
      console.error("xAI extract failed", error);
      if (aborted) {
        return { ok: false, error: "识别超时了（3 分钟）。照片还在，请再点一次识别。" };
      }
      return { ok: false, error: "识别中断了，请检查网络后重试。" };
    }
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
  .middleware([authMiddleware])
  .handler(
    async ({ data }): Promise<{ ok: true; bbox?: ImageBBox } | { ok: false; error: string }> => {
      const apiKey = process.env.XAI_API_KEY;
      if (!apiKey) return { ok: false, error: "暂未开通定位" };
      try {
        const res = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "grok-4.5",
            temperature: 0,
            max_tokens: 400,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: LOCATE_PROMPT },
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: data.imageDataUrl, detail: "high" } },
                  { type: "text", text: "标出图形框。" },
                ],
              },
            ],
          }),
        });
        if (!res.ok) return { ok: false, error: "定位失败" };
        const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = payload.choices?.[0]?.message?.content ?? "";
        const parsed = parseJsonValue(text) as Record<string, unknown>;
        if (parsed.hasFigure === false) return { ok: true };
        const bbox = normalizeBBox(parsed.figureBbox ?? parsed.bbox, 0.04);
        return { ok: true, bbox };
      } catch (error) {
        console.error("locate figure failed", error);
        return { ok: false, error: "定位中断" };
      }
    },
  );
