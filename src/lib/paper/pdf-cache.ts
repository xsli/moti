import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type CachedPdf = { base64: string; warnings: string[] };
const WEEK = 7 * 24 * 60 * 60 * 1000;
const validKey = (key: string) => /^[a-f0-9]{64}$/.test(key);

export async function readPdfCache(directory: string, key: string): Promise<CachedPdf | null> {
  if (!validKey(key)) return null;
  try {
    const file = path.join(directory, `${key}.json`);
    const info = await stat(file);
    if (info.size > 41_000_000 || Date.now() - info.mtimeMs > WEEK) return null;
    const data = JSON.parse(await readFile(file, "utf8"));
    if (typeof data.base64 !== "string" || !Array.isArray(data.warnings) ||
      !data.warnings.every((w: unknown) => typeof w === "string") ||
      data.digest !== createHash("sha256").update(data.base64).digest("hex") ||
      Buffer.from(data.base64.slice(0, 12), "base64").subarray(0, 5).toString() !== "%PDF-") return null;
    return { base64: data.base64, warnings: data.warnings };
  } catch { return null; }
}

export async function writePdfCache(directory: string, key: string, data: CachedPdf): Promise<void> {
  if (!validKey(key)) return;
  const temporary = path.join(directory, `${key}.${randomUUID()}.tmp`);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, JSON.stringify({ ...data, digest: createHash("sha256").update(data.base64).digest("hex") }));
    await rename(temporary, path.join(directory, `${key}.json`));
    const entries: { file: string; time: number; size: number }[] = [];
    for (const name of await readdir(directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const file = path.join(directory, name), info = await stat(file);
      entries.push({ file, time: info.mtimeMs, size: info.size });
    }
    let bytes = 0;
    for (const [index, entry] of entries.sort((a, b) => b.time - a.time).entries()) {
      bytes += entry.size;
      if (index >= 20 || bytes > 200_000_000 || Date.now() - entry.time > WEEK) await unlink(entry.file);
    }
  } catch { /* Caching is optional; a full/read-only disk must not break export. */ }
  finally { await unlink(temporary).catch(() => {}); }
}
