import { Link } from "@tanstack/react-router";
import { ShoppingBasket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col gap-2 rounded-xl bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-center gap-2">
        <ShoppingBasket className="size-4 text-muted-foreground" />
        <span className="text-sm">组卷篮 {items.length} 道</span>
        <button type="button" className="text-sm text-muted-foreground hover:text-fg" onClick={clearBasket}>
          清空
        </button>
        <Button asChild size="sm" className="ml-auto" disabled={!items.length}>
          <Link to="/paper" search={{ ids: items.map((p) => p.id).join(","), tpl: "" }}>
            用篮子排版
          </Link>
        </Button>
      </div>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              className="inline-flex h-7 max-w-40 items-center gap-1 rounded-full bg-secondary pl-2.5 pr-1 text-xs"
              onClick={() => removeFromBasket(p.id)}
              title="移出篮子"
            >
              <span className="truncate">{p.title}</span>
              <X className="size-3 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
