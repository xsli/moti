import { createServerFn } from "@tanstack/react-start";
import { localUserMiddleware } from "../local-user";
import { gaokaoPdfSchema } from "./gaokao-pdf-schema";

export const compileGaokaoPdf = createServerFn({ method: "POST" })
  .validator(gaokaoPdfSchema)
  .middleware([localUserMiddleware])
  .handler(async ({ data }) => {
    try {
      const { createGaokaoPdf } = await import("./gaokao-pdf.server");
      return { ok: true as const, ...await createGaokaoPdf(data) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "LaTeX 排版失败，请重试" };
    }
  });
