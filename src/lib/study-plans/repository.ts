import { planContentSchema, type PlanContent, type StudyPlan } from "./model.ts";

export interface PlanSql {
  query<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
}
export const STUDY_PLAN_SCHEMA = `create table if not exists study_plans (
  user_id text not null, id text not null, revision integer not null,
  payload text not null, created_at bigint not null, updated_at bigint not null,
  primary key (user_id,id));
  create table if not exists study_plan_versions (
  user_id text not null, plan_id text not null, revision integer not null,
  payload text not null, saved_at bigint not null, primary key(user_id,plan_id,revision));`;
type Row = {
  id: string;
  revision: number;
  payload: string;
  created_at: number;
  updated_at: number;
};
function decode(r: Row): StudyPlan {
  return {
    ...planContentSchema.parse(JSON.parse(r.payload)),
    id: r.id,
    revision: r.revision,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}
export async function readPlan(sql: PlanSql, user: string, id: string) {
  const rows = await sql.query<Row>("select * from study_plans where user_id=$1 and id=$2", [
    user,
    id,
  ]);
  return rows[0] ? decode(rows[0]) : null;
}
export async function listPlans(sql: PlanSql, user: string) {
  const rows = await sql.query<Row>(
    "select * from study_plans where user_id=$1 order by updated_at desc,id",
    [user],
  );
  return rows.map(decode);
}
export async function writePlan(
  sql: PlanSql,
  user: string,
  id: string,
  revision: number,
  raw: PlanContent,
  now = Date.now(),
) {
  const content = planContentSchema.parse(raw);
  const old = await readPlan(sql, user, id);
  if ((old?.revision ?? 0) !== revision)
    throw new Error("计划已在其他页面更新，请重新打开后再修改。当前修改尚未保存。");
  if (old?.status === "archived" && content.status === "archived")
    throw new Error("请先恢复归档计划，再进行修改。");
  const payload = JSON.stringify(content);
  // The revision check, plan write and history snapshot commit in one statement.
  const query = old
    ? `with saved as (update study_plans set payload=$3,revision=revision+1,updated_at=$4
       where user_id=$1 and id=$2 and revision=$5 returning *),
       history as (insert into study_plan_versions(user_id,plan_id,revision,payload,saved_at)
       select user_id,id,revision,payload,updated_at from saved) select * from saved`
    : `with saved as (insert into study_plans(user_id,id,payload,created_at,updated_at,revision)
       values($1,$2,$3,$4,$4,1) on conflict(user_id,id) do nothing returning *),
       history as (insert into study_plan_versions(user_id,plan_id,revision,payload,saved_at)
       select user_id,id,revision,payload,updated_at from saved) select * from saved`;
  const rows = await sql.query<Row>(
    query,
    old ? [user, id, payload, now, revision] : [user, id, payload, now],
  );
  if (!rows[0]) throw new Error("计划已被更新，请重新打开后再保存。");
  return decode(rows[0]);
}
