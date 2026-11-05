import { z } from "zod";

const id = z.string().min(1).max(100);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "请选择日期")
  .refine(
    (s) => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "日期无效",
  );
const title = z.string().trim().min(1, "请填写名称").max(160);
const note = z.string().max(12000);
export const TASK_LABELS = {
  practice: "练习",
  learn: "预学",
  homework: "作业",
  mock: "模拟",
  review: "复盘",
} as const;
export const taskSchema = z
  .object({
    id,
    title,
    kind: z.enum(["practice", "learn", "homework", "mock", "review"]),
    materialId: z.string().max(100),
    examReview: z
      .object({
        collectionId: id,
        problemIds: z.array(id).min(1).max(200),
      })
      .optional(),
    round: z.number().int().min(1).max(10),
    target: z.number().int().min(1).max(10000),
    done: z.number().int().min(0).max(10000),
    unit: z.string().trim().min(1).max(12),
    minutes: z.number().finite().min(0).max(10000),
    note,
  })
  .refine((t) => t.done <= t.target, { message: "已完成数量不能超过计划数量", path: ["done"] });
export const weekSchema = z
  .object({
    id,
    title,
    start: date,
    end: date,
    focus: note,
    tasks: z.array(taskSchema).max(100),
  })
  .refine((w) => w.end >= w.start, { message: "结束日期不能早于开始日期", path: ["end"] });
export const materialSchema = z.object({
  id,
  title,
  collectionId: z.string().max(100),
  problemIds: z.array(id).max(200),
  notes: note,
});
export const slotSchema = z
  .object({
    id,
    day: z.number().int().min(1).max(7),
    time: z.string().trim().min(1).max(100),
    hours: z.number().finite().min(0).max(16),
    homeworkHours: z.number().finite().min(0).max(16),
    activity: z.string().max(1000),
  })
  .refine((s) => s.homeworkHours <= s.hours, {
    message: "作业时间不能超过可用时间",
    path: ["homeworkHours"],
  });
export const planContentSchema = z
  .object({
    title,
    startDate: date,
    examDate: date,
    goal: note,
    notes: note,
    status: z.enum(["active", "archived"]),
    weeks: z.array(weekSchema).max(60),
    materials: z.array(materialSchema).max(200),
    slots: z.array(slotSchema).max(50),
  })
  .superRefine((p, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (p.examDate < p.startDate) issue("考试日期不能早于备考开始日期");
    const unique = (items: { id: string }[]) =>
      new Set(items.map((x) => x.id)).size === items.length;
    if (![p.weeks, p.materials, p.slots, p.weeks.flatMap((w) => w.tasks)].every(unique))
      issue("记录编号重复");
    const materials = new Set(p.materials.map((m) => m.id));
    for (const w of p.weeks) {
      if (w.start < p.startDate || w.end > p.examDate) issue(`「${w.title}」超出备考日期范围`);
      if (w.tasks.some((t) => t.materialId && !materials.has(t.materialId)))
        issue("任务关联的资料已不存在");
    }
  });
export type PlanContent = z.infer<typeof planContentSchema>;
export type StudyTask = z.infer<typeof taskSchema>;
export type StudyWeek = z.infer<typeof weekSchema>;
export type StudyMaterial = z.infer<typeof materialSchema>;
export type StudySlot = z.infer<typeof slotSchema>;
export type StudyPlan = PlanContent & {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
};
export const savePlanSchema = z.object({
  id,
  expectedRevision: z.number().int().min(0),
  content: planContentSchema,
});

export function dateToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function daysUntil(date: string, today = dateToday()) {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
}
export function progress(tasks: StudyTask[]) {
  return {
    total: tasks.length,
    complete: tasks.filter((t) => t.done === t.target).length,
    percent: tasks.length
      ? Math.round((tasks.reduce((s, t) => s + t.done / t.target, 0) / tasks.length) * 100)
      : 0,
  };
}
export function materialProgress(plan: PlanContent, materialId: string) {
  const rounds = new Map<string, { round: number; target: number; done: number; unit: string }>();
  for (const task of plan.weeks
    .flatMap((w) => w.tasks)
    .filter((t) => t.materialId === materialId)) {
    const key = `${task.round}:${task.unit}`;
    const r = rounds.get(key) ?? { round: task.round, target: 0, done: 0, unit: task.unit };
    r.target += task.target;
    r.done += task.done;
    rounds.set(key, r);
  }
  return [...rounds.values()].sort((a, b) => a.round - b.round || a.unit.localeCompare(b.unit));
}
export function weekCapacity(week: Pick<StudyWeek, "start" | "end">, slots: StudySlot[]) {
  let hours = 0;
  for (let day = Date.parse(week.start); day <= Date.parse(week.end); day += 86400000) {
    const weekday = new Date(day).getUTCDay() || 7;
    hours += slots.filter((s) => s.day === weekday).reduce((s, slot) => s + slot.hours, 0);
  }
  return hours;
}
export function makeWeeks(start: string, exam: string): StudyWeek[] {
  const end = Date.parse(exam) - 86400000;
  if ((end - Date.parse(start)) / 86400000 > 419) throw new Error("单份计划最多安排60周");
  const weeks: StudyWeek[] = [];
  for (let day = Date.parse(start); day <= end; day += 7 * 86400000) {
    weeks.push({
      id: crypto.randomUUID(),
      title: `第${weeks.length + 1}周`,
      start: new Date(day).toISOString().slice(0, 10),
      end: new Date(Math.min(end, day + 6 * 86400000)).toISOString().slice(0, 10),
      focus: "",
      tasks: [],
    });
  }
  return weeks;
}
export function emptyPlan(title: string, startDate: string, examDate: string): PlanContent {
  return {
    title,
    startDate,
    examDate,
    goal: "",
    notes: "",
    status: "active",
    weeks: [],
    materials: [],
    slots: [],
  };
}
export function contentOf(p: StudyPlan): PlanContent {
  const { id: _id, revision: _revision, createdAt: _created, updatedAt: _updated, ...content } = p;
  return content;
}

export const newTask = (): StudyTask => ({
  id: crypto.randomUUID(),
  title: "",
  kind: "practice",
  materialId: "",
  round: 1,
  target: 1,
  done: 0,
  unit: "题",
  minutes: 60,
  note: "",
});
export const newWeek = (start = dateToday(), end = start): StudyWeek => ({
  id: crypto.randomUUID(),
  title: "新的学习阶段",
  start,
  end,
  focus: "",
  tasks: [],
});
