import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildKnowledgeLatex, knowledgeFigureAssets } from "./knowledge-pdf-template";
import type { KnowledgeReport } from "./knowledge-schema";
import { readPdfCache, writePdfCache, type CachedPdf } from "../paper/pdf-cache";

const pending = new Map<string, Promise<CachedPdf>>();
let queue: Promise<unknown> = Promise.resolve();

export async function createKnowledgePdf(report: KnowledgeReport, stale: boolean): Promise<CachedPdf> {
  const tex = buildKnowledgeLatex(report, stale);
  const assets = knowledgeFigureAssets(report);
  const key = createHash("sha256").update(tex).update(JSON.stringify(assets)).digest("hex");
  const cacheDir = path.resolve(".local-tools/tectonic/knowledge-pdf-cache");
  if (pending.has(key)) return pending.get(key)!;
  if (pending.size >= 4) throw new Error("排版任务较多，请稍后重试。");
  const job = (async () => {
    const cached = await readPdfCache(cacheDir, key);
    if (cached) return cached;
    const work = queue.catch(() => {}).then(() => compile(tex, assets));
    queue = work;
    const result = await work;
    await writePdfCache(cacheDir, key, result);
    return result;
  })();
  pending.set(key, job);
  try { return await job; } finally { pending.delete(key); }
}

async function compile(tex: string, assets: ReturnType<typeof knowledgeFigureAssets>): Promise<CachedPdf> {
  const executable = process.env.MOTI_TECTONIC_PATH || path.resolve(".local-tools/tectonic", process.platform === "win32" ? "tectonic.exe" : "tectonic");
  try { await access(executable); } catch { throw new Error("PDF 排版组件未就绪，请先运行 npm run latex:setup。"); }
  const directory = await mkdtemp(path.join(tmpdir(), "moti-knowledge-pdf-"));
  try {
    for (const asset of assets) {
      const bytes = Buffer.from(asset.image.split(",")[1], "base64");
      const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (bytes.length > 15_000_000 || !(asset.path.endsWith(".png") ? png : jpeg)) throw new Error("原题配图损坏或过大，请在题库核对。");
      await writeFile(path.join(directory, asset.path), bytes);
    }
    await writeFile(path.join(directory, "notes.tex"), tex, "utf8");
    await new Promise<void>((resolve, reject) => {
      execFile(executable, ["--untrusted", "--only-cached", "--keep-logs", "notes.tex"], {
        cwd: directory, windowsHide: true, timeout: 180_000, maxBuffer: 2_000_000,
        env: { ...process.env, TECTONIC_CACHE_DIR: path.resolve(".local-tools/tectonic/cache") },
      }, (error, stdout, stderr) => {
        if (!error) return resolve();
        console.error("Knowledge PDF compilation failed", `${stdout}\n${stderr}`.slice(-3000));
        reject(new Error(error.killed ? "笔记排版超时，请稍后重试。" : "笔记排版失败，请检查公式或运行 npm run latex:setup 准备排版组件。"));
      });
    });
    const pdf = await readFile(path.join(directory, "notes.pdf"));
    if (pdf.length > 30_000_000 || pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("PDF 无效或超过30MB，请减少内容后重试。");
    return { base64: pdf.toString("base64"), warnings: [] };
  } finally { await rm(directory, { recursive: true, force: true }); }
}
