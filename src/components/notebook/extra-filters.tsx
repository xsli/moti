import { useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ExtraFilters({ children, activeCount, onClear, activeFilters = [] }: {
  children: ReactNode;
  activeCount: number;
  onClear: () => void;
  activeFilters?: { key: string; label: string; onRemove: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant={activeCount ? "secondary" : "ghost"} size="sm" onClick={() => setOpen(true)}>
      <SlidersHorizontal />筛选{activeCount ? ` (${activeCount})` : ""}
    </Button>
    {activeFilters.map((filter) => <Button key={filter.key} size="sm" variant="secondary" className="max-w-full" onClick={filter.onRemove} aria-label={`清除${filter.label}`} title={`清除${filter.label}`}>
      <span className="truncate">{filter.label}</span><X />
    </Button>)}
    {activeCount ? <Button size="sm" variant="ghost" onClick={onClear}>清除筛选</Button> : null}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>筛选题目</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-3 py-4">{children}</div>
        <DialogFooter><Button variant="ghost" disabled={!activeCount} onClick={onClear}>清除筛选</Button><Button onClick={() => setOpen(false)}>完成</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
