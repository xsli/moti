import { Link } from "@tanstack/react-router";
import { ShoppingBasket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { usePaperStore } from "@/lib/paper/store";
import { useProblemStore } from "@/lib/problems/store";

export function BasketBar() {
  const basket = usePaperStore((s) => s.basket);
  const removeFromBasket = usePaperStore((s) => s.removeFromBasket);
  const clearBasket = usePaperStore((s) => s.clearBasket);
  const problems = useProblemStore((s) => s.problems);
  if (!basket.length) return null;
  const items = basket
    .map((id) => problems.find((p) => p.id === id))
    .filter(Boolean) as typeof problems;

  return (
    <div className="flex flex-col gap-2 border-y border-border py-2">
      <div className="flex flex-wrap items-center gap-2">
        <ShoppingBasket className="size-4 text-muted-foreground" />
        <span className="text-sm">组卷篮 {items.length} 道</span>
        <ConfirmAction title={`取消已选的 ${items.length} 道题？`} description="仅取消组卷选择，题库中的题目不会删除。" confirmLabel="确认清空" onConfirm={clearBasket}>
        <button type="button" className="text-sm text-muted-foreground hover:text-fg">
          清空
        </button>
        </ConfirmAction>
        <Button asChild size="sm" className="ml-auto" disabled={!items.length}>
          <Link to="/paper" search={{ ids: "", tpl: "" }}>
            去组卷
          </Link>
        </Button>
      </div>
      {items.length ? (
        <details className="text-xs text-muted-foreground"><summary className="w-fit cursor-pointer">查看已选题目</summary><div className="mt-2 flex flex-wrap gap-1.5">
          {items.slice(0, 12).map((p) => (
            <ConfirmAction key={p.id} title={`取消选择“${p.title}”？`} description="仅取消组卷选择，题库中的题目不会删除。" confirmLabel="确认移出" onConfirm={() => removeFromBasket(p.id)}>
            <button
              type="button"
              className="inline-flex h-7 max-w-40 items-center gap-1 rounded-full bg-secondary pl-2.5 pr-1 text-xs"
              title="取消选择"
            >
              <span className="truncate">{p.title}</span>
              <X className="size-3 shrink-0 text-muted-foreground" />
            </button>
            </ConfirmAction>
          ))}
          {items.length > 12 ? <Link to="/paper" search={{ ids: "", tpl: "" }} className="self-center text-primary">另 {items.length - 12} 道</Link> : null}
        </div></details>
      ) : null}
    </div>
  );
}
