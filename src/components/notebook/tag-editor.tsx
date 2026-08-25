import { useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_TAGS = 8;
const MAX_LEN = 16;

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_LEN);
}

export function TagEditor({
  tags,
  onChange,
  suggestions = [],
  placeholder = "添加标签",
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function add(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) {
      setDraft("");
      return;
    }
    onChange([...tags, tag]);
    setDraft("");
    inputRef.current?.focus();
  }

  const hint = suggestions.filter((s) => !tags.includes(s) && (!draft || s.includes(draft.trim()))).slice(0, 8);

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-surface px-2 py-1.5",
          "transition-[box-shadow] focus-within:ring-2 focus-within:ring-ring/30",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-full bg-secondary pl-2.5 pr-1 text-sm text-fg"
            onClick={(e) => {
              e.stopPropagation();
              onChange(tags.filter((t) => t !== tag));
            }}
          >
            {tag}
            <span className="grid size-5 place-items-center text-muted-foreground">
              <X className="size-3" />
            </span>
          </button>
        ))}
        {tags.length < MAX_TAGS ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
            placeholder={tags.length ? "" : placeholder}
            className="h-7 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "," || e.key === "、" || e.key === "Tab") {
                if (draft.trim()) {
                  e.preventDefault();
                  add(draft);
                }
              }
              if (e.key === "Backspace" && !draft && tags.length) {
                onChange(tags.slice(0, -1));
              }
            }}
          />
        ) : null}
      </div>
      {hint.length ? (
        <div className="flex flex-wrap gap-1.5">
          {hint.map((tag) => (
            <button
              key={tag}
              type="button"
              className="h-7 rounded-full px-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-fg"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
