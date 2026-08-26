import { Link } from "@tanstack/react-router";
import { FileStack, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { idsFromRows } from "@/lib/paper/session";
import { usePaperStore } from "@/lib/paper/store";
import { useProblemStore } from "@/lib/problems/store";

export function TemplateList() {
  const templates = usePaperStore((s) => s.templates);
  const deleteTemplate = usePaperStore((s) => s.deleteTemplate);
  const problems = useProblemStore((s) => s.problems);
  const available = new Set(problems.map((p) => p.id));
  if (!templates.length) return null;

  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm font-medium">已存模板</p>
      <ul className="flex flex-col gap-2">
        {templates.map((tpl) => {
          const ids = idsFromRows(tpl.rows).filter((id) => available.has(id));
          return (
            <li
              key={tpl.id}
              className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-[var(--shadow-border)]"
            >
              <FileStack className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{tpl.name}</p>
                <p className="text-xs text-muted-foreground">
                  {tpl.title} · {ids.length} 道{tpl.withAnswers ? " · 解析版" : ""}
                </p>
              </div>
              <Button asChild size="sm" variant="outline" disabled={!ids.length}>
                <Link to="/paper" search={{ ids: ids.join(","), tpl: tpl.id }}>
                  打开
                </Link>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="删除模板"
                onClick={() => deleteTemplate(tpl.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
