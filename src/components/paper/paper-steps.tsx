import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PaperSteps({ current }: { current: "pick" | "arrange" | "preview" }) {
  return <ol aria-label="组卷步骤" className="flex items-center gap-3 text-sm print:hidden">
    {([["pick", "选题"], ["arrange", "排版"], ["preview", "预览与导出"]] as const).map(([id, label], i) => <li key={id} aria-current={current === id ? "step" : undefined} className={cn("flex items-center gap-3", current === id ? "font-semibold text-primary" : "text-muted-foreground")}>
      {i ? <ChevronRight className="size-3" aria-hidden /> : null}<span>{i + 1}. {label}</span>
    </li>)}
  </ol>;
}
