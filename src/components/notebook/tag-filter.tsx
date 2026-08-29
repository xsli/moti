import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function TagFilter({
  tags,
  value,
  onChange,
}: {
  tags: string[];
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...tags].sort((a, b) => a.localeCompare(b, "zh"));
    return q ? list.filter((item) => item.toLowerCase().includes(q)) : list;
  }, [tags, query]);

  if (!tags.length) return null;

  const label = value.length === 1 ? value[0] : value.length > 1 ? `标签 ${value.length}` : "标签";

  function toggle(tag: string) {
    onChange(value.includes(tag) ? value.filter((item) => item !== tag) : [...value, tag]);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "h-9 max-w-44 truncate rounded-full px-3.5 text-sm transition-colors",
          value.length || open ? "bg-fg text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-fg",
        )}
      >
        {label}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-60 rounded-xl bg-surface p-2 shadow-[var(--shadow-border-hover)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="找标签"
              className="h-8 w-full rounded-md bg-secondary pl-7 pr-2 text-sm outline-none"
            />
          </div>
          <ul className="mt-1 max-h-52 overflow-auto">
            {filtered.length ? (
              filtered.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    aria-pressed={value.includes(item)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary",
                      value.includes(item) && "bg-secondary",
                    )}
                    onClick={() => toggle(item)}
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border border-border",
                        value.includes(item) && "border-fg bg-fg text-primary-foreground",
                      )}
                    >
                      {value.includes(item) ? <Check className="size-3" /> : null}
                    </span>
                    {item}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-2 py-2 text-xs text-muted-foreground">没有这个标签</li>
            )}
          </ul>
          {value.length ? (
            <button
              type="button"
              className="mt-1 w-full border-t border-border px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-fg"
              onClick={() => onChange([])}
            >
              清除全部标签
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
