import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function TagFilter({
  tags,
  value,
  onChange,
}: {
  tags: string[];
  value: string;
  onChange: (tag: string) => void;
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

  return (
    <div ref={rootRef} className="relative">
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          className="inline-flex h-9 items-center gap-1 rounded-full bg-fg px-3 text-sm text-primary-foreground"
        >
          {value}
          <X className="size-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            "h-9 rounded-full px-3.5 text-sm transition-colors",
            open ? "bg-fg text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-fg",
          )}
        >
          标签
        </button>
      )}
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl bg-surface p-2 shadow-[var(--shadow-border-hover)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
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
                    className="flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
                    onClick={() => {
                      onChange(item);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    {item}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-2 py-2 text-xs text-muted-foreground">没有这个标签</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
