import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExamItem } from "./layout";
import type { GaokaoPdfRequest } from "./gaokao-pdf-schema";
import { buildGaokaoLatex, EXAM_ZH_FILES, EXAM_ZH_REVISION, type GaokaoSource } from "./gaokao-latex";
import { readPdfCache, writePdfCache } from "./pdf-cache";

type Result = { base64: string; warnings: string[] };
const pending = new Map<string, Promise<Result>>();
const cache = new Map<string, Result>();
let queue: Promise<unknown> = Promise.resolve();

export async function createGaokaoPdf(data: GaokaoPdfRequest): Promise<Result> {
  const source = makeSource(data);
  const tex = data.options.withAnswers ? source.teacher! : source.student;
  // Hash the generated source too, so template changes never reuse an old PDF.
  const key = createHash("sha256").update(EXAM_ZH_REVISION).update(tex)
    .update(JSON.stringify(source.assets.map(a => [a.path, a.figure.image])))
    .update(JSON.stringify(source.warnings)).digest("hex");
  if (cache.has(key)) return cache.get(key)!;
  if (pending.has(key)) return pending.get(key)!;
  if (pending.size >= 4) throw new Error("排版任务较多，请稍后重试");
  const directory = path.resolve(".local-tools/tectonic/pdf-cache");
  const job = (async () => {
    const saved = await readPdfCache(directory, key);
    if (saved) return saved;
    const work = queue.catch(() => {}).then(() => compile(source, tex));
    queue = work;
    const result = await work;
    await writePdfCache(directory, key, result);
    return result;
  })();
  pending.set(key, job);
  try {
    const result = await job;
    cache.set(key, result);
    while (cache.size > 3) cache.delete(cache.keys().next().value!);
    return result;
  } finally { pending.delete(key); }
}

function makeSource(data: GaokaoPdfRequest): GaokaoSource {
  const items: ExamItem[] = data.items.map((item, index) => item.kind === "heading" ? item : ({
    ...item, number: index + 1, label: String(index + 1), blankLines: 5,
    problem: {
      ...item.problem, figures: item.problem.figures.map(f => ({ ...f, svg: "", title: "", caption: "" })),
      createdAt: 0, updatedAt: 0, sourceKind: "text", subject: "algebra", difficulty: 3,
      mastery: "new", myAnswer: "", errorReason: "unknown", reviewCount: 0, nextReviewAt: 0,
    },
  }));
  return buildGaokaoLatex(items, data.options);
}

async function compile(source: GaokaoSource, tex: string): Promise<Result> {
  const executable = process.env.MOTI_TECTONIC_PATH || path.resolve(".local-tools/tectonic", process.platform === "win32" ? "tectonic.exe" : "tectonic");
  try { await access(executable); }
  catch { throw new Error("未找到 LaTeX 编译器，请运行 npm run latex:setup 或设置 MOTI_TECTONIC_PATH"); }
  let vendor = path.resolve("public/vendor/exam-zh");
  try { await access(path.join(vendor, "exam-zh.cls")); }
  catch { vendor = path.resolve(".output/public/vendor/exam-zh"); }
  const directory = await mkdtemp(path.join(tmpdir(), "moti-latex-"));
  try {
    await mkdir(path.join(directory, "images"));
    for (const name of EXAM_ZH_FILES) await copyFile(path.join(vendor, name), path.join(directory, name));
    for (const asset of source.assets) {
      const bytes = Buffer.from(asset.figure.image!.split(",")[1], "base64");
      const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!(asset.path.endsWith(".png") ? png : jpeg)) throw new Error("配图数据损坏，请重新读取配图");
      await writeFile(path.join(directory, asset.path), bytes);
    }
    await writeFile(path.join(directory, "paper.tex"), tex, "utf8");
    await new Promise<void>((resolve, reject) => {
      execFile(executable, ["--untrusted", "--only-cached", "--keep-logs", "paper.tex"], {
        cwd: directory, windowsHide: true, timeout: 180_000, maxBuffer: 2_000_000,
        env: { ...process.env, TECTONIC_CACHE_DIR: path.resolve(".local-tools/tectonic/cache") },
      }, (error, stdout, stderr) => {
        if (!error) return resolve();
        const log = `${stdout}\n${stderr}`;
        const detail = log.split(/\r?\n/).filter(s => /error:|^!|paper\.tex:\d+/.test(s)).slice(-5).join("\n");
        reject(new Error(error.killed ? "LaTeX 排版超时，请减少题目后重试" : `LaTeX 排版失败：${detail || "编译资源未就绪，请运行 npm run latex:setup"}`));
      });
    });
    const pdf = await readFile(path.join(directory, "paper.pdf"));
    if (pdf.length > 30_000_000 || pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("生成的 PDF 无效或超过 30 MB");
    return { base64: pdf.toString("base64"), warnings: source.warnings };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
