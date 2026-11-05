import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  emptyPlan,
  makeWeeks,
  materialProgress,
  planContentSchema,
  progress,
  weekCapacity,
  type StudyTask,
} from "./model.ts";
import { STUDY_PLAN_SCHEMA, listPlans, readPlan, writePlan, type PlanSql } from "./repository.ts";

const task = (overrides: Partial<StudyTask> = {}): StudyTask => ({
  id: "task",
  title: "全等",
  kind: "practice",
  materialId: "m",
  round: 1,
  target: 20,
  done: 8,
  unit: "题",
  minutes: 60,
  note: "",
  ...overrides,
});
function fixture() {
  return {
    ...emptyPlan("备考", "2026-11-05", "2027-01-03"),
    materials: [{ id: "m", title: "全等", collectionId: "c", problemIds: [], notes: "" }],
    weeks: [
      {
        id: "w",
        title: "启动",
        start: "2026-11-05",
        end: "2026-11-08",
        focus: "",
        tasks: [task()],
      },
    ],
  };
}
test("date validation, target bounds, unique ids and material references", () => {
  assert.ok(planContentSchema.safeParse(fixture()).success);
  assert.equal(
    planContentSchema.safeParse({ ...fixture(), examDate: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    planContentSchema.safeParse({ ...fixture(), examDate: "2026-11-01" }).success,
    false,
  );
  assert.equal(planContentSchema.safeParse({ ...fixture(), materials: [] }).success, false);
  for (const tasks of [[task({ done: 21 })], [task({ target: 0 })], [task(), task()]]) {
    const p = fixture();
    p.weeks[0].tasks = tasks;
    assert.equal(planContentSchema.safeParse(p).success, false);
  }
});
test("partial weeks count only matching weekdays; no dependence on timezone or DST", () => {
  const p = fixture();
  assert.equal(
    weekCapacity(p.weeks[0], [
      { id: "s", day: 5, time: "全天", hours: 7, homeworkHours: 3, activity: "" },
      { id: "t", day: 2, time: "晚上", hours: 3, homeworkHours: 0, activity: "" },
    ]),
    7,
  );
  const weeks = makeWeeks("2026-12-28", "2027-01-03");
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].end, "2027-01-02");
  assert.equal(makeWeeks("2027-01-03", "2027-01-03").length, 0);
});
test("progress separates rounds and units and counts partial tasks", () => {
  const p = fixture();
  p.weeks[0].tasks.push(
    task({ id: "t2", round: 2, done: 3 }),
    task({ id: "t3", target: 1, done: 1, unit: "讲" }),
  );
  const rows = materialProgress(p, "m");
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.round === 1 && r.unit === "题")?.done, 8);
  assert.equal(rows.find((r) => r.round === 2)?.done, 3);
  assert.deepEqual(progress([]), { total: 0, complete: 0, percent: 0 });
  assert.equal(progress(p.weeks[0].tasks).complete, 1);
});
test("database persists plans, atomic history, conflicts, tenant isolation and archive restore", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(STUDY_PLAN_SCHEMA);
    const sql: PlanSql = {
      query: async <T>(query: string, params?: unknown[]) =>
        (await pg.query<T>(query, params)).rows,
    };
    const linked = fixture();
    linked.weeks[0].tasks[0].examReview = { collectionId: "exam", problemIds: ["q1", "q2"] };
    let p = await writePlan(sql, "a", "plan", 0, linked, 100);
    assert.equal(p.revision, 1);
    assert.equal((await readPlan(sql, "a", "plan"))?.weeks[0].tasks[0].done, 8);
    assert.deepEqual(
      (await readPlan(sql, "a", "plan"))?.weeks[0].tasks[0].examReview,
      linked.weeks[0].tasks[0].examReview,
    );
    assert.equal(await readPlan(sql, "b", "plan"), null);
    assert.deepEqual(await listPlans(sql, "b"), []);
    await assert.rejects(writePlan(sql, "a", "plan", 0, fixture()), /更新/);
    const changed = fixture();
    changed.weeks[0].tasks[0].done = 20;
    const concurrent = await Promise.allSettled([
      writePlan(sql, "a", "plan", 1, changed),
      writePlan(sql, "a", "plan", 1, fixture()),
    ]);
    assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
    p = (await readPlan(sql, "a", "plan"))!;
    assert.equal(p.revision, 2);
    p = await writePlan(sql, "a", "plan", 2, { ...p, status: "archived" });
    await assert.rejects(writePlan(sql, "a", "plan", 3, { ...p, title: "不可改" }), /恢复归档/);
    p = await writePlan(sql, "a", "plan", 3, { ...p, status: "active" });
    assert.equal(p.status, "active");
    assert.equal(p.createdAt, 100);
    const history = await sql.query<{ revision: number; payload: string }>(
      "select revision,payload from study_plan_versions where user_id=$1 and plan_id=$2 order by revision",
      ["a", "plan"],
    );
    assert.equal(history.length, 4);
    assert.equal(JSON.parse(history[0].payload).weeks[0].tasks[0].done, 8);
    assert.equal((await listPlans(sql, "a")).length, 1);
  } finally {
    await pg.close();
  }
});
