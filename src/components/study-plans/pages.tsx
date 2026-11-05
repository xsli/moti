import { useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Download,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Target,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProblemStore } from "@/lib/problems/store";
import { getStudyPlan, listStudyPlans, saveStudyPlan } from "@/lib/study-plans/api";
import {
  TASK_LABELS,
  contentOf,
  dateToday,
  daysUntil,
  emptyPlan,
  makeWeeks,
  newTask,
  newWeek,
  materialProgress,
  planContentSchema,
  progress,
  weekCapacity,
  type PlanContent,
  type StudyPlan,
  type StudyTask,
  type StudyWeek,
  type StudyMaterial,
  type StudySlot,
} from "@/lib/study-plans/model";
import { MaterialForm, PlanForm, SlotForm, TaskForm, WeekForm } from "./forms";

const card = "rounded-xl border border-border bg-surface p-5";
const round = (n: number) => Math.round(n * 10) / 10;
const weekDays = ["一", "二", "三", "四", "五", "六", "日"];
function Countdown({ date }: { date: string }) {
  const days = daysUntil(date);
  return <span>{days > 0 ? `距考试 ${days} 天` : days === 0 ? "今天考试" : "考试日期已过"}</span>;
}
function ProgressBar({ value }: { value: number }) {
  return (
    <div
      role="progressbar"
      aria-label="任务进度"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 overflow-hidden rounded-full bg-secondary"
    >
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
export function StudyPlansPage() {
  const [plans, setPlans] = useState<StudyPlan[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [filter, setFilter] = useState<"active" | "archived">("active"),
    [create, setCreate] = useState(false);
  const navigate = useNavigate();
  const createId = useRef("");
  useEffect(() => {
    let live = true;
    listStudyPlans()
      .then((p) => {
        if (live) setPlans(p);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  const visible = plans.filter((p) => p.status === filter);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">备考定制</h1>
          <p className="mt-2 text-sm text-muted-foreground">安排每周学习，记录每一遍练习。</p>
        </div>
        <Button
          onClick={() => {
            createId.current = crypto.randomUUID();
            setCreate(true);
          }}
        >
          <Plus />
          新增备考计划
        </Button>
      </header>
      <div className="flex gap-2">
        {(
          [
            ["active", "进行中"],
            ["archived", "已归档"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={filter === value ? "default" : "outline"}
            onClick={() => setFilter(value)}
          >
            {label}（{plans.filter((p) => p.status === value).length}）
          </Button>
        ))}
      </div>
      {loading && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          正在读取计划…
        </p>
      )}
      {error && (
        <div role="alert" className={card}>
          <p>{error}</p>
          <Button className="mt-3" variant="outline" onClick={() => window.location.reload()}>
            重新加载
          </Button>
        </div>
      )}
      {!loading && !error && !visible.length && (
        <div className={`${card} py-16 text-center`}>
          <Target className="mx-auto mb-4 size-8 text-primary" />
          <h2 className="text-lg font-semibold">
            {filter === "active" ? "创建第一份备考计划" : "还没有归档计划"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {filter === "active"
              ? "选择考试日期，再添加学习阶段、资料和每周时间。"
              : "归档后仍可查看进度，也可以恢复继续学习。"}
          </p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((p) => {
          const s = progress(p.weeks.flatMap((w) => w.tasks));
          return (
            <Link
              key={p.id}
              to="/study-plans/$id"
              params={{ id: p.id }}
              className={`${card} block transition-shadow hover:shadow-md`}
            >
              <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <CalendarDays className="size-4" />
                  {p.examDate}
                </span>
                {p.status === "archived" ? <span>已归档</span> : <Countdown date={p.examDate} />}
              </div>
              <h2 className="my-4 break-words text-xl font-semibold">{p.title}</h2>
              <p className="mb-4 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                {p.goal || "尚未填写考试目标"}
              </p>
              <ProgressBar value={s.percent} />
              <div className="mt-3 flex justify-between text-sm">
                <span>
                  {s.complete}/{s.total} 项任务完成
                </span>
                <span>{s.percent}%</span>
              </div>
            </Link>
          );
        })}
      </div>
      {create && (
        <PlanForm
          creating
          value={{ title: "", startDate: dateToday(), examDate: dateToday(), goal: "", notes: "" }}
          close={() => setCreate(false)}
          save={async (v) => {
            const content = {
              ...emptyPlan(v.title, v.startDate, v.examDate),
              ...v,
              weeks: makeWeeks(v.startDate, v.examDate),
            };
            const parsed = planContentSchema.safeParse(content);
            if (!parsed.success) throw new Error(parsed.error.issues[0].message);
            const p = await saveStudyPlan({
              data: { id: createId.current, expectedRevision: 0, content },
            });
            setPlans((current) => [p, ...current]);
            setCreate(false);
            // Let the editor unmount its unsaved-change guard before navigating.
            window.setTimeout(
              () => void navigate({ to: "/study-plans/$id", params: { id: p.id } }),
              0,
            );
            return true;
          }}
        />
      )}
    </div>
  );
}

type Editing =
  | { type: "plan" }
  | { type: "week"; value: StudyWeek }
  | { type: "task"; weekId: string; value: StudyTask }
  | { type: "material"; value: StudyMaterial }
  | { type: "slot"; value: StudySlot };
export function StudyPlanPage({ id }: { id: string }) {
  const [plan, setPlan] = useState<StudyPlan | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Editing | null>(null);
  const [tab, setTab] = useState<"weeks" | "materials" | "time" | "info">("weeks");
  const saving = useRef(false);
  const collections = useProblemStore((s) => s.collections),
    problems = useProblemStore((s) => s.problems);
  useEffect(() => {
    let live = true;
    getStudyPlan({ data: { id } })
      .then((p) => {
        if (live) setPlan(p);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [id]);
  useBlocker({
    shouldBlockFn: () => busy && !window.confirm("正在保存内容，确定离开？"),
    enableBeforeUnload: busy,
  });
  async function commit(content: PlanContent) {
    if (!plan || saving.current) return false;
    const result = planContentSchema.safeParse(content);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return false;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await saveStudyPlan({
        data: { id, expectedRevision: plan.revision, content: result.data },
      });
      setPlan(next);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，当前修改尚未保存。");
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (loading)
    return (
      <p className="flex items-center gap-2 py-12">
        <LoaderCircle className="size-4 animate-spin" />
        正在读取计划…
      </p>
    );
  if (!plan)
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link to="/study-plans">
            <ArrowLeft />
            返回备考计划
          </Link>
        </Button>
        <p role="alert">{error || "计划不存在"}</p>
      </div>
    );
  const editable = plan.status === "active",
    content = contentOf(plan),
    allTasks = plan.weeks.flatMap((w) => w.tasks),
    stats = progress(allTasks);
  const available = plan.slots.reduce((s, x) => s + x.hours, 0),
    homework = plan.slots.reduce((s, x) => s + x.homeworkHours, 0);
  const putWeek = (week: StudyWeek) =>
    commit({
      ...content,
      weeks: [...plan.weeks.filter((w) => w.id !== week.id), week].sort((a, b) =>
        a.start.localeCompare(b.start),
      ),
    });
  const putTask = (weekId: string, task: StudyTask) =>
    commit({
      ...content,
      weeks: plan.weeks.map((w) =>
        w.id === weekId
          ? {
              ...w,
              tasks: w.tasks.some((t) => t.id === task.id)
                ? w.tasks.map((t) => (t.id === task.id ? task : t))
                : [...w.tasks, task],
            }
          : w,
      ),
    });
  const addWeek = () =>
    setEditing({ type: "week", value: newWeek(plan.startDate, plan.startDate) });
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${plan.title.replace(/[<>:"/\\|?*]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link to="/study-plans">
            <ArrowLeft />
            返回备考计划
          </Link>
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {busy ? "正在保存…" : `已保存 · ${new Date(plan.updatedAt).toLocaleString("zh-CN")}`}
        </span>
      </div>
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex gap-3 text-sm text-primary">
              <span>{plan.examDate} 考试</span>
              {editable ? <Countdown date={plan.examDate} /> : <span>已归档</span>}
            </div>
            <h1 className="break-words font-display text-2xl font-semibold sm:text-3xl">
              {plan.title}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setEditing({ type: "plan" })}
              >
                <Pencil />
                编辑计划
              </Button>
            )}
            <Button variant="outline" onClick={download}>
              <Download />
              导出存档
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (
                  !editable ||
                  window.confirm("归档后保留全部任务与进度，可随时恢复。现在归档这份计划？")
                )
                  void commit({ ...content, status: editable ? "archived" : "active" });
              }}
            >
              {editable ? <Archive /> : <RotateCcw />}
              {editable ? "归档" : "恢复计划"}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [`${stats.percent}%`, "任务进度"],
            [`${stats.complete}/${stats.total}`, "已完成任务"],
            [`${round(available)} 小时`, "每周可用（含作业）"],
            [`${plan.materials.length} 份`, "备考资料"],
          ].map(([n, label]) => (
            <div key={label} className={card}>
              <div className="text-2xl font-semibold text-primary">{n}</div>
              <div className="mt-1 text-sm text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p>{error}</p>
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => {
              if (!editing || window.confirm("重新打开会放弃当前表单，继续？"))
                window.location.reload();
            }}
          >
            重新打开已保存版本
          </Button>
        </div>
      )}
      <nav aria-label="备考计划内容" className="flex flex-wrap gap-2 border-b border-border pb-4">
        {(
          [
            ["weeks", "周计划"],
            ["materials", "资料与轮次"],
            ["time", "每周时间"],
            ["info", "目标与约定"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={tab === value ? "default" : "outline"}
            onClick={() => setTab(value)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {tab === "weeks" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">学习阶段</h2>
            {editable && (
              <Button variant="outline" disabled={busy} onClick={addWeek}>
                <Plus />
                添加阶段
              </Button>
            )}
          </div>
          {!plan.weeks.length && (
            <div className={`${card} py-10 text-center text-muted-foreground`}>
              添加一个学习阶段，再安排具体任务。
            </div>
          )}
          {plan.weeks.map((week) => {
            const s = progress(week.tasks),
              hours = week.tasks.reduce((s, t) => s + t.minutes, 0) / 60,
              capacity = weekCapacity(week, plan.slots),
              current = dateToday() >= week.start && dateToday() <= week.end;
            return (
              <details
                key={week.id}
                open
                className={`${card} group p-0 ${current ? "border-primary/50" : ""}`}
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-5">
                  <div>
                    <h3 className="flex items-center gap-2 text-lg font-semibold">
                      <ChevronDown className="size-4 group-open:rotate-0 -rotate-90" />
                      {week.title}
                      {current && (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          当前
                        </span>
                      )}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {week.start} 至 {week.end}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {s.complete}/{s.total} 项完成 · 预计 {round(hours)} 小时
                    {plan.slots.length > 0 && (
                      <span className={hours > capacity ? "ml-2 text-destructive" : "ml-2"}>
                        可用 {round(capacity)} 小时
                      </span>
                    )}
                  </span>
                </summary>
                <div className="space-y-4 border-t border-border p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">
                      {week.focus}
                    </p>
                    {editable && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setEditing({ type: "week", value: week })}
                        >
                          修改阶段
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          aria-label={`删除${week.title}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `删除「${week.title}」及其中 ${week.tasks.length} 项任务？`,
                              )
                            )
                              void commit({
                                ...content,
                                weeks: plan.weeks.filter((w) => w.id !== week.id),
                              });
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="divide-y divide-border">
                    {week.tasks.map((task) => {
                      const material = plan.materials.find((m) => m.id === task.materialId);
                      return (
                        <div key={task.id} className="flex items-start gap-3 py-4">
                          <input
                            type="checkbox"
                            className="mt-1 size-5 shrink-0 accent-primary"
                            aria-label={`完成任务：${task.title}`}
                            checked={task.done === task.target}
                            disabled={!editable || busy}
                            onChange={(e) =>
                              void putTask(week.id, {
                                ...task,
                                done: e.target.checked ? task.target : 0,
                              })
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4
                                className={`font-medium ${task.done === task.target ? "text-muted-foreground line-through" : ""}`}
                              >
                                {task.title}
                              </h4>
                              <span className="rounded bg-secondary px-2 py-0.5 text-xs">
                                {TASK_LABELS[task.kind]}
                                {task.kind === "practice" ? ` · 第${task.round}遍` : ""}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {task.done}/{task.target} {task.unit} · 预计{" "}
                              {round(task.minutes / 60)} 小时
                            </p>
                            {task.note && (
                              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                                {task.note}
                              </p>
                            )}
                            {task.examReview && (
                              <a
                                className="mt-2 inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4"
                                href={`/exam-analysis/${encodeURIComponent(task.examReview.collectionId)}?view=overview&questions=${encodeURIComponent(task.examReview.problemIds.join(","))}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <BookOpen className="size-3.5" />
                                打开本批原题、关联题与补充训练
                              </a>
                            )}
                            {material?.collectionId &&
                              !material.problemIds.length &&
                              collections.some((c) => c.id === material.collectionId) && (
                                <a
                                  className="mt-2 inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4"
                                  href={`/?g=${encodeURIComponent(material.collectionId)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <BookOpen className="size-3.5" />
                                  {material.title}
                                </a>
                              )}
                            {material && material.problemIds.length > 0 && (
                              <Button
                                size="sm"
                                variant="link"
                                onClick={() => {
                                  setTab("materials");
                                  requestAnimationFrame(() =>
                                    document
                                      .getElementById(`study-material-${material.id}`)
                                      ?.scrollIntoView({ block: "start" }),
                                  );
                                }}
                              >
                                查看指定题目
                              </Button>
                            )}
                          </div>
                          {editable && (
                            <div className="flex shrink-0 gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  setEditing({ type: "task", weekId: week.id, value: task })
                                }
                              >
                                修改 / 进度
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                aria-label={`删除任务：${task.title}`}
                                onClick={() => {
                                  if (window.confirm(`删除任务「${task.title}」？`))
                                    void commit({
                                      ...content,
                                      weeks: plan.weeks.map((w) =>
                                        w.id === week.id
                                          ? { ...w, tasks: w.tasks.filter((t) => t.id !== task.id) }
                                          : w,
                                      ),
                                    });
                                }}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {editable && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        setEditing({ type: "task", weekId: week.id, value: newTask() })
                      }
                    >
                      <Plus />
                      添加任务
                    </Button>
                  )}
                </div>
              </details>
            );
          })}
        </section>
      )}
      {tab === "materials" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">资料与练习轮次</h2>
            {editable && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setEditing({
                    type: "material",
                    value: {
                      id: crypto.randomUUID(),
                      title: "",
                      collectionId: "",
                      problemIds: [],
                      notes: "",
                    },
                  })
                }
              >
                <Plus />
                添加资料
              </Button>
            )}
          </div>
          {!plan.materials.length && (
            <p className={card}>添加题库讲次或指定题目，再在学习任务中关联这份资料。</p>
          )}
          {plan.materials.map((m) => (
            <article id={`study-material-${m.id}`} key={m.id} className={`${card} scroll-mt-24`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-lg font-semibold">{m.title}</h3>
                {editable && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditing({ type: "material", value: m })}
                    >
                      修改
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`移除资料：${m.title}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            "移除资料后，已有任务及进度仍保留，但不再关联这份资料。继续？",
                          )
                        )
                          void commit({
                            ...content,
                            materials: plan.materials.filter((x) => x.id !== m.id),
                            weeks: plan.weeks.map((w) => ({
                              ...w,
                              tasks: w.tasks.map((t) =>
                                t.materialId === m.id ? { ...t, materialId: "" } : t,
                              ),
                            })),
                          });
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
              <p className="my-3 whitespace-pre-wrap text-sm text-muted-foreground">{m.notes}</p>
              <div className="mb-3 flex flex-wrap gap-3">
                {materialProgress(plan, m.id).map((r) => (
                  <span
                    key={r.round + r.unit}
                    className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary"
                  >
                    第{r.round}遍：{r.done}/{r.target} {r.unit}
                  </span>
                ))}
              </div>
              {m.collectionId &&
                (collections.some((c) => c.id === m.collectionId) ? (
                  <a
                    href={`/?g=${encodeURIComponent(m.collectionId)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline underline-offset-4"
                  >
                    打开讲次 ↗
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    原讲次已不在题库，计划记录仍保留。
                  </p>
                ))}
              {m.problemIds.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-primary">
                    指定题目（{m.problemIds.length}）
                  </summary>
                  <ul className="mt-2 space-y-2 text-sm">
                    {m.problemIds.map((pid) => (
                      <li key={pid}>
                        {problems.some((p) => p.id === pid) ? (
                          <a
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline underline-offset-4"
                            href={`/p/${encodeURIComponent(pid)}`}
                          >
                            {problems.find((p) => p.id === pid)?.title} ↗
                          </a>
                        ) : (
                          <span className="text-muted-foreground">题目已不在题库</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </section>
      )}
      {tab === "time" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              每周可用 {round(available)} 小时 · 作业 {round(homework)} 小时 · 专项{" "}
              {round(available - homework)} 小时
            </h2>
            {editable && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setEditing({
                    type: "slot",
                    value: {
                      id: crypto.randomUUID(),
                      day: 5,
                      time: "",
                      hours: 1,
                      homeworkHours: 0,
                      activity: "",
                    },
                  })
                }
              >
                <Plus />
                添加时段
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            填写扣除休息后的净时间，上课时间不计入。周计划中的作业任务也占用这里的可用时间。
          </p>
          {!plan.slots.length && (
            <p className={card}>添加固定学习时段后，每个阶段会显示可用时间。</p>
          )}
          {[...plan.slots]
            .sort((a, b) => a.day - b.day)
            .map((s) => (
              <div
                key={s.id}
                className={`${card} flex flex-wrap items-start justify-between gap-4`}
              >
                <div>
                  <h3 className="font-semibold">
                    周{weekDays[s.day - 1]} · {s.time}
                  </h3>
                  <p className="my-2 text-sm text-primary">
                    可用 {round(s.hours)} 小时 · 其中作业 {round(s.homeworkHours)} 小时
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{s.activity}</p>
                </div>
                {editable && (
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setEditing({ type: "slot", value: s })}
                    >
                      修改
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`移除时段：周${weekDays[s.day - 1]}${s.time}`}
                      onClick={() => {
                        if (window.confirm("移除这个固定时段？"))
                          void commit({
                            ...content,
                            slots: plan.slots.filter((x) => x.id !== s.id),
                          });
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            ))}
        </section>
      )}
      {tab === "info" && (
        <section className="grid gap-4">
          <article className={card}>
            <h2 className="mb-3 text-lg font-semibold">考试范围与目标</h2>
            <p className="whitespace-pre-wrap leading-7">{plan.goal || "尚未填写"}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              备考开始：{plan.startDate} · 考试日期：{plan.examDate}
            </p>
          </article>
          <article className={card}>
            <h2 className="mb-3 text-lg font-semibold">执行约定</h2>
            <p className="whitespace-pre-wrap leading-7">{plan.notes || "尚未填写"}</p>
          </article>
        </section>
      )}
      {editing?.type === "plan" && (
        <PlanForm
          value={plan}
          close={() => setEditing(null)}
          save={(v) => commit({ ...content, ...v })}
        />
      )}
      {editing?.type === "week" && (
        <WeekForm value={editing.value} close={() => setEditing(null)} save={putWeek} />
      )}
      {editing?.type === "task" && (
        <TaskForm
          value={editing.value}
          materials={plan.materials}
          close={() => setEditing(null)}
          save={(t) => putTask(editing.weekId, t)}
        />
      )}
      {editing?.type === "material" && (
        <MaterialForm
          value={editing.value}
          close={() => setEditing(null)}
          save={(m) =>
            commit({
              ...content,
              materials: plan.materials.some((x) => x.id === m.id)
                ? plan.materials.map((x) => (x.id === m.id ? m : x))
                : [...plan.materials, m],
            })
          }
        />
      )}
      {editing?.type === "slot" && (
        <SlotForm
          value={editing.value}
          close={() => setEditing(null)}
          save={(s) =>
            commit({
              ...content,
              slots: plan.slots.some((x) => x.id === s.id)
                ? plan.slots.map((x) => (x.id === s.id ? s : x))
                : [...plan.slots, s],
            })
          }
        />
      )}
    </div>
  );
}
