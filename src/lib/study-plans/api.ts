import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { localUserMiddleware } from "@/lib/local-user";
import { savePlanSchema } from "./model";
import { STUDY_PLAN_SCHEMA, listPlans, readPlan, writePlan } from "./repository";

let ready: Promise<void> | undefined;
async function schema() {
  const sql = await getSql();
  ready ??= (async () => {
    for (const statement of STUDY_PLAN_SCHEMA.split(";").filter((s) => s.trim()))
      await sql.query(statement);
  })().catch((e) => {
    ready = undefined;
    throw e;
  });
  await ready;
  return sql;
}
export const listStudyPlans = createServerFn({ method: "POST" })
  .middleware([localUserMiddleware])
  .handler(async ({ context }) => listPlans(await schema(), context.userId));
export const getStudyPlan = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({ id: z.string().min(1).max(100) }).parse(v))
  .middleware([localUserMiddleware])
  .handler(async ({ data, context }) => readPlan(await schema(), context.userId, data.id));
export const saveStudyPlan = createServerFn({ method: "POST" })
  .validator((v: unknown) => savePlanSchema.parse(v))
  .middleware([localUserMiddleware])
  .handler(async ({ data, context }) =>
    writePlan(await schema(), context.userId, data.id, data.expectedRevision, data.content),
  );
