import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { localUserMiddleware } from "../local-user";
import { knowledgeScopeSchema } from "./knowledge-schema";
import { getKnowledgeReport } from "./knowledge";

export const exportKnowledgePdf = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ scope: knowledgeScopeSchema, expectedGeneratedAt: z.number() }).parse(input))
  .middleware([localUserMiddleware])
  .handler(async ({ data }) => {
    try {
      const { report, stale } = await getKnowledgeReport({ data: data.scope });
      if (!report) throw new Error("请先生成并保存知识沉淀。");
      if (report.generatedAt !== data.expectedGeneratedAt) throw new Error("笔记已更新，请重新打开后导出最新版本。");
      const { createKnowledgePdf } = await import("./knowledge-pdf.server");
      return { ok: true as const, ...await createKnowledgePdf(report, stale) };
    } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "PDF 导出失败，请重试。" }; }
  });
