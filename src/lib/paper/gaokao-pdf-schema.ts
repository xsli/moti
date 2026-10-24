import { z } from "zod";

const figure = z.object({
  id: z.string().min(1).max(80), inline: z.boolean().optional(),
  image: z.string().max(16_000_000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/),
});
const role = z.enum(["points", "example", "practice"]);
export const gaokaoPdfSchema = z.object({
  options: z.object({
    title: z.string().min(1).max(200), withAnswers: z.boolean(),
    minutes: z.number().int().min(0).max(600), solutionSpaceCm: z.number().min(0).max(15),
  }),
  items: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("heading"), title: z.string().max(200), role }),
    z.object({ kind: z.literal("problem"), role, points: z.number().min(0).max(1000).optional(), problem: z.object({
      id: z.string().min(1).max(80), title: z.string().max(200), stem: z.string().max(20000),
      correctAnswer: z.string().max(20000), analysis: z.string().max(50000), notes: z.string().max(5000),
      tags: z.array(z.string().max(80)).max(30), figures: z.array(figure).max(30),
    }) }),
  ])).min(1).max(200),
}).refine(data => JSON.stringify(data).length <= 40_000_000, "试卷配图过大，请减少题目后重试");

export type GaokaoPdfRequest = z.infer<typeof gaokaoPdfSchema>;
