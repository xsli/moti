import { usePaperStore } from "@/lib/paper/store";
import { cn } from "@/lib/utils";

export function LayoutPick({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const templates = usePaperStore((s) => s.templates);
  if (!templates.length) return null;
  return (
    <label className={cn("flex items-center gap-2 text-sm", className)}>
      <span className="shrink-0 text-muted-foreground">套用</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 max-w-[10rem] rounded-md bg-secondary px-2 text-sm outline-none"
        aria-label="套用已有模板"
      >
        <option value="">不套用模板</option>
        {templates.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.name}
          </option>
        ))}
      </select>
    </label>
  );
}
