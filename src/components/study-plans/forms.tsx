import { useRef, useState, type ReactNode, type FormEvent } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useProblemStore } from "@/lib/problems/store";
import {
  TASK_LABELS,
  type PlanContent,
  type StudyMaterial,
  type StudySlot,
  type StudyTask,
  type StudyWeek,
} from "@/lib/study-plans/model";

export const selectClass = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm";
export function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
      {name}
      {children}
    </label>
  );
}
export function Editor({
  title,
  close,
  save,
  children,
}: {
  title: string;
  close: () => void;
  save: () => Promise<boolean>;
  children: ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const saved = useRef(false);
  useBlocker({
    shouldBlockFn: () =>
      !saved.current && (dirty || saving) && !window.confirm("放弃尚未保存的表单并离开？"),
    enableBeforeUnload: dirty || saving,
  });
  const dismiss = () => {
    if (!saving && (!dirty || window.confirm("放弃尚未保存的修改？"))) close();
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (await save()) {
        saved.current = true;
        close();
      } else setError("尚未保存，请检查页面提示后重试。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) dismiss();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] max-w-2xl overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          dismiss();
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">填写后保存到备考计划。</DialogDescription>
        <form onSubmit={submit} onChange={() => setDirty(true)} className="grid gap-4">
          <fieldset
            disabled={saving}
            onClick={(e) => {
              if ((e.target as Element).closest("button,[role=option]")) setDirty(true);
            }}
            className="grid gap-4"
          >
            {children}
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={dismiss}>
              取消
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlanForm({
  value,
  close,
  save,
  creating = false,
}: {
  value: Pick<PlanContent, "title" | "startDate" | "examDate" | "goal" | "notes">;
  close: () => void;
  save: (v: typeof value) => Promise<boolean>;
  creating?: boolean;
}) {
  const [v, set] = useState(value);
  return (
    <Editor title={creating ? "新增备考计划" : "编辑计划"} close={close} save={() => save(v)}>
      <Field name="计划名称">
        <Input
          required
          maxLength={160}
          value={v.title}
          onChange={(e) => set({ ...v, title: e.target.value })}
          placeholder="例如：1月集训队考试"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field name="开始日期">
          <Input
            type="date"
            required
            value={v.startDate}
            onChange={(e) => set({ ...v, startDate: e.target.value })}
          />
        </Field>
        <Field name="考试日期">
          <Input
            type="date"
            required
            min={v.startDate}
            value={v.examDate}
            onChange={(e) => set({ ...v, examDate: e.target.value })}
          />
        </Field>
      </div>
      <Field name="考试范围与目标">
        <Textarea
          value={v.goal}
          rows={4}
          maxLength={12000}
          onChange={(e) => set({ ...v, goal: e.target.value })}
          placeholder="考试范围、当前进度、需要完成的轮次…"
        />
      </Field>
      <Field name="执行约定">
        <Textarea
          value={v.notes}
          rows={4}
          maxLength={12000}
          onChange={(e) => set({ ...v, notes: e.target.value })}
          placeholder="例如：第一遍后隔一周重做，周日核对进度。"
        />
      </Field>
    </Editor>
  );
}
export function WeekForm({
  value,
  close,
  save,
}: {
  value: StudyWeek;
  close: () => void;
  save: (v: StudyWeek) => Promise<boolean>;
}) {
  const [v, set] = useState(value);
  return (
    <Editor title="安排学习阶段" close={close} save={() => save(v)}>
      <Field name="阶段名称">
        <Input
          required
          value={v.title}
          maxLength={160}
          onChange={(e) => set({ ...v, title: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field name="开始日期">
          <Input
            required
            type="date"
            value={v.start}
            onChange={(e) => set({ ...v, start: e.target.value })}
          />
        </Field>
        <Field name="结束日期">
          <Input
            required
            type="date"
            min={v.start}
            value={v.end}
            onChange={(e) => set({ ...v, end: e.target.value })}
          />
        </Field>
      </div>
      <Field name="本阶段重点">
        <Textarea
          rows={3}
          value={v.focus}
          maxLength={12000}
          onChange={(e) => set({ ...v, focus: e.target.value })}
        />
      </Field>
    </Editor>
  );
}
export function TaskForm({
  value,
  materials,
  close,
  save,
}: {
  value: StudyTask;
  materials: StudyMaterial[];
  close: () => void;
  save: (v: StudyTask) => Promise<boolean>;
}) {
  const [v, set] = useState(value);
  return (
    <Editor title="编辑学习任务" close={close} save={() => save(v)}>
      <Field name="任务名称">
        <Input
          required
          value={v.title}
          maxLength={160}
          onChange={(e) => set({ ...v, title: e.target.value })}
          placeholder="例如：全等三角形第一遍"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field name="类型">
          <select
            className={selectClass}
            value={v.kind}
            onChange={(e) => set({ ...v, kind: e.target.value as StudyTask["kind"] })}
          >
            {Object.entries(TASK_LABELS).map(([k, s]) => (
              <option key={k} value={k}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field name="第几遍">
          <Input
            type="number"
            required
            min={1}
            max={10}
            value={v.round}
            onChange={(e) => set({ ...v, round: e.target.valueAsNumber })}
          />
        </Field>
      </div>
      <Field name="关联资料">
        <select
          className={selectClass}
          value={v.materialId}
          onChange={(e) => set({ ...v, materialId: e.target.value })}
        >
          <option value="">不关联</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field name="计划数量">
          <Input
            required
            type="number"
            min={1}
            max={10000}
            value={v.target}
            onChange={(e) => set({ ...v, target: e.target.valueAsNumber })}
          />
        </Field>
        <Field name="已完成">
          <Input
            required
            type="number"
            min={0}
            max={v.target}
            value={v.done}
            onChange={(e) => set({ ...v, done: e.target.valueAsNumber })}
          />
        </Field>
        <Field name="单位">
          <Input
            required
            value={v.unit}
            maxLength={12}
            onChange={(e) => set({ ...v, unit: e.target.value })}
          />
        </Field>
      </div>
      <Field name="预计用时（分钟，含核对订正）">
        <Input
          required
          type="number"
          min={0}
          max={10000}
          value={v.minutes}
          onChange={(e) => set({ ...v, minutes: e.target.valueAsNumber })}
        />
      </Field>
      <Field name="范围与备注">
        <Textarea
          rows={4}
          value={v.note}
          maxLength={12000}
          onChange={(e) => set({ ...v, note: e.target.value })}
          placeholder="题号、小问范围、错因和下次调整…"
        />
      </Field>
    </Editor>
  );
}
export function MaterialForm({
  value,
  close,
  save,
}: {
  value: StudyMaterial;
  close: () => void;
  save: (v: StudyMaterial) => Promise<boolean>;
}) {
  const [v, set] = useState(value),
    [search, setSearch] = useState("");
  const collections = useProblemStore((s) => s.collections),
    problems = useProblemStore((s) => s.problems);
  const matches = problems
    .filter(
      (p) =>
        (!v.collectionId || p.collectionId === v.collectionId) &&
        search.trim() &&
        `${p.title} ${p.stem}`.includes(search.trim()),
    )
    .slice(0, 20);
  return (
    <Editor title="编辑备考资料" close={close} save={() => save(v)}>
      <Field name="资料名称">
        <Input
          required
          value={v.title}
          maxLength={160}
          onChange={(e) => set({ ...v, title: e.target.value })}
          placeholder="例如：大视野八年级·全等三角形"
        />
      </Field>
      <div className="grid gap-1.5 text-sm font-medium">
        关联讲次
        <SearchableSelect
          label="关联讲次"
          value={v.collectionId}
          options={[
            { value: "", label: "不关联讲次" },
            ...collections.map((c) => ({ value: c.id, label: `${c.groupName} · ${c.name}` })),
          ]}
          onChange={(id) => {
            const c = collections.find((c) => c.id === id);
            set({
              ...v,
              collectionId: id,
              title: v.title || (c ? `${c.groupName} · ${c.name}` : ""),
            });
          }}
        />
      </div>
      <Field name="搜索指定题目（可选）">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="输入标题或题干关键词"
        />
      </Field>
      {search && (
        <div className="max-h-40 overflow-y-auto rounded-md border border-border">
          {matches.length ? (
            matches.map((p) => (
              <button
                type="button"
                key={p.id}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                onClick={() => {
                  if (!v.problemIds.includes(p.id))
                    set({ ...v, problemIds: [...v.problemIds, p.id] });
                  setSearch("");
                }}
              >
                {p.title}
              </button>
            ))
          ) : (
            <p className="p-3 text-sm text-muted-foreground">没有匹配题目</p>
          )}
        </div>
      )}
      {v.problemIds.length > 0 && (
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {v.problemIds.map((id) => (
            <div
              key={id}
              className="flex items-center justify-between gap-2 rounded bg-secondary/50 px-3 py-1 text-sm"
            >
              <span>{problems.find((p) => p.id === id)?.title || "题目已不在题库"}</span>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => set({ ...v, problemIds: v.problemIds.filter((x) => x !== id) })}
              >
                移除
              </Button>
            </div>
          ))}
        </div>
      )}
      <Field name="练习范围与要求">
        <Textarea
          rows={4}
          value={v.notes}
          maxLength={12000}
          onChange={(e) => set({ ...v, notes: e.target.value })}
          placeholder="整讲两遍，或指定题目及小问范围"
        />
      </Field>
    </Editor>
  );
}
export function SlotForm({
  value,
  close,
  save,
}: {
  value: StudySlot;
  close: () => void;
  save: (v: StudySlot) => Promise<boolean>;
}) {
  const [v, set] = useState(value);
  return (
    <Editor title="安排每周时间" close={close} save={() => save(v)}>
      <div className="grid grid-cols-2 gap-3">
        <Field name="星期">
          <select
            className={selectClass}
            value={v.day}
            onChange={(e) => set({ ...v, day: Number(e.target.value) })}
          >
            {["一", "二", "三", "四", "五", "六", "日"].map((d, i) => (
              <option key={d} value={i + 1}>
                周{d}
              </option>
            ))}
          </select>
        </Field>
        <Field name="时间段">
          <Input
            required
            maxLength={100}
            value={v.time}
            onChange={(e) => set({ ...v, time: e.target.value })}
            placeholder="19:00–22:30"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field name="净可用时间（小时）">
          <Input
            type="number"
            required
            min={0}
            max={16}
            step="any"
            value={v.hours}
            onChange={(e) => set({ ...v, hours: e.target.valueAsNumber })}
          />
        </Field>
        <Field name="其中作业（小时）">
          <Input
            type="number"
            required
            min={0}
            max={v.hours}
            step="any"
            value={v.homeworkHours}
            onChange={(e) => set({ ...v, homeworkHours: e.target.valueAsNumber })}
          />
        </Field>
      </div>
      <Field name="主要安排">
        <Textarea
          value={v.activity}
          maxLength={1000}
          rows={3}
          onChange={(e) => set({ ...v, activity: e.target.value })}
        />
      </Field>
    </Editor>
  );
}
