import { Check, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DateFilter } from "@/lib/problems/dates";
import { cn } from "@/lib/utils";

export function dateFilterLabel(value: DateFilter, day: string) {
  return value === "today" ? "今天" : value === "7d" ? "近7天" : value === "30d" ? "近30天" : value === "day" && day ? day : "日期";
}

export function FilterMenu<T extends string>({
  idleLabel,
  value,
  emptyValue,
  options,
  onChange,
}: {
  idleLabel: string;
  value: T;
  emptyValue: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((item) => item.id === value);
  const active = value !== emptyValue;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "h-9 rounded-md border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
          active || open ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-surface text-fg hover:bg-secondary",
        )}
      >
        {active ? current?.label ?? idleLabel : idleLabel}
      </button>
      {open ? (
        <ul className="absolute left-0 top-full z-20 mt-1 min-w-32 rounded-xl bg-surface p-1 shadow-[var(--shadow-border-hover)]">
          {options.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-secondary",
                  item.id === value && "bg-secondary",
                )}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DateMenu({
  value,
  day,
  onChange,
}: {
  value: DateFilter;
  day: string;
  onChange: (value: DateFilter, day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const label = dateFilterLabel(value, day);
  const active = value !== "all";

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const presets: { id: DateFilter; label: string }[] = [
    { id: "all", label: "全部日期" },
    { id: "today", label: "今天" },
    { id: "7d", label: "近7天" },
    { id: "30d", label: "近30天" },
  ];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "h-9 rounded-md border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
          active || open ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-surface text-fg hover:bg-secondary",
        )}
      >
        {label}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-xl bg-surface p-1 shadow-[var(--shadow-border-hover)]">
          {presets.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-secondary",
                item.id === value && value !== "day" && "bg-secondary",
              )}
              onClick={() => {
                onChange(item.id, "");
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
          <label className="mt-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground">
            某一天
            <input
              type="date"
              value={value === "day" ? day : ""}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) {
                  onChange("all", "");
                  return;
                }
                onChange("day", next);
                setOpen(false);
              }}
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function DifficultyMenu({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const label = value.length === 1 ? `${value[0]} 星` : value.length > 1 ? `星级 ${value.length}` : "星级";

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function toggle(difficulty: number) {
    onChange(
      value.includes(difficulty)
        ? value.filter((item) => item !== difficulty)
        : [...value, difficulty].sort((a, b) => a - b),
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "h-9 rounded-md border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
          value.length || open ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-surface text-fg hover:bg-secondary",
        )}
      >
        {label}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-32 rounded-xl bg-surface p-1 shadow-[var(--shadow-border-hover)]">
          {[1, 2, 3, 4, 5].map((difficulty) => {
            const selected = value.includes(difficulty);
            return (
              <button
                key={difficulty}
                type="button"
                aria-pressed={selected}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-secondary",
                  selected && "bg-secondary",
                )}
                onClick={() => toggle(difficulty)}
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded border border-border",
                    selected && "border-primary bg-primary/10 text-primary",
                  )}
                >
                  {selected ? <Check className="size-3" /> : null}
                </span>
                <span className="flex items-center gap-1">
                  <span>{difficulty}</span>
                  <Star className="size-3.5 fill-current text-primary" />
                </span>
              </button>
            );
          })}
          {value.length ? (
            <button
              type="button"
              className="mt-1 w-full border-t border-border px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-fg"
              onClick={() => onChange([])}
            >
              清除全部星级
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
