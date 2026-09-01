import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { localUserMiddleware } from "@/lib/local-user";
import { getSql } from "@/lib/db";

let schemaReady: Promise<void> | null = null;

async function ensurePaperSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = await getSql();
      await sql.query(`
        create table if not exists paper_sessions (
          user_id text primary key,
          payload text not null,
          updated_at bigint not null
        )
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

export const getPaperSessionFn = createServerFn({ method: "POST" })
  .middleware([localUserMiddleware])
  .handler(async ({ context }) => {
    await ensurePaperSchema();
    const sql = await getSql();
    const rows = await sql`select payload from paper_sessions where user_id = ${context.userId}`;
    const payload = (rows[0] as { payload?: unknown } | undefined)?.payload;
    return { payload: typeof payload === "string" ? payload : "" };
  });

export const putPaperSessionFn = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        basket: z.array(z.string().max(80)).max(80),
        templates: z.array(z.unknown()).max(20),
        deletedTemplates: z.record(z.string().max(80), z.number()).optional().default({}),
      })
      .parse(input),
  )
  .middleware([localUserMiddleware])
  .handler(async ({ context, data }) => {
    await ensurePaperSchema();
    const sql = await getSql();
    const payload = JSON.stringify(data);
    const now = Date.now();
    await sql.query(
      `insert into paper_sessions (user_id, payload, updated_at)
       values ($1, $2, $3)
       on conflict (user_id) do update set payload = excluded.payload, updated_at = excluded.updated_at`,
      [context.userId, payload, now],
    );
    return { ok: true as const };
  });
