import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export function paperFileStem(title: string): string {
  const stem = title
    .replace(/[\\/:*?"<>|]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return stem || "试卷";
}

export const saveSamplePdf = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(80),
        base64: z.string().min(80).max(50_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const stem = paperFileStem(data.name).replace(/\s+/g, "-");
    const file = `${stem}.pdf`;
    const bytes = Buffer.from(data.base64, "base64");
    for (const dir of [path.join(process.cwd(), "sample"), path.join(process.cwd(), "public", "sample")]) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, file), bytes);
    }
    return { file };
  });
