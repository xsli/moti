import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COLLECTION_KIND_LABEL,
  COLLECTION_KINDS,
  defaultCollectionName,
  type CollectionKind,
} from "@/lib/problems/collections";
import { useProblemStore } from "@/lib/problems/store";
import { cn } from "@/lib/utils";

export function CollectionPicker({
  value,
  onChange,
  label = "收入",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const collections = useProblemStore((s) => s.collections);
  const addCollection = useProblemStore((s) => s.addCollection);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(defaultCollectionName);
  const [kind, setKind] = useState<CollectionKind>("exam");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const id = await addCollection({ name, kind });
      onChange(id);
      setCreating(false);
      setName(defaultCollectionName());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 min-w-40 rounded-md bg-secondary px-2 text-sm outline-none"
          aria-label="选择分组"
        >
          <option value="">未分组</option>
          {collections.map((item) => (
            <option key={item.id} value={item.id}>
              {COLLECTION_KIND_LABEL[item.kind]} · {item.name}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" variant="outline" onClick={() => setCreating((v) => !v)}>
          {creating ? "取消" : "新建组"}
        </Button>
      </div>
      {creating ? (
        <div className="flex flex-col gap-2 rounded-xl bg-surface p-3 shadow-[var(--shadow-border)]">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：3月月考卷" />
          <div className="flex flex-wrap gap-1.5">
            {COLLECTION_KINDS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setKind(item)}
                className={cn(
                  "h-8 rounded-full px-3 text-sm",
                  kind === item ? "bg-fg text-primary-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                {COLLECTION_KIND_LABEL[item]}
              </button>
            ))}
          </div>
          <Button type="button" size="sm" onClick={() => void create()} disabled={busy || !name.trim()}>
            创建并选中
          </Button>
        </div>
      ) : null}
    </div>
  );
}
