import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  COLLECTION_KIND_LABEL,
  COLLECTION_KINDS,
  UNGROUPED_FOLDER,
  collectionFolders,
  defaultCollectionName,
  type CollectionKind,
} from "@/lib/problems/collections";
import { useProblemStore } from "@/lib/problems/store";
import { cn } from "@/lib/utils";

const NEW = "__new__";

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
  const selected = collections.find((item) => item.id === value);
  const [folder, setFolder] = useState(selected?.groupName ?? "");
  const [dialog, setDialog] = useState<null | "folder" | "group">(null);
  const [draftName, setDraftName] = useState("");
  const [kind, setKind] = useState<CollectionKind>("exam");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selected) setFolder(selected.groupName);
  }, [selected]);

  const folders = useMemo(() => {
    const names = collectionFolders(collections);
    if (folder && !names.includes(folder)) names.push(folder);
    return names;
  }, [collections, folder]);
  const groups = useMemo(
    () => collections.filter((item) => (item.groupName || "") === folder),
    [collections, folder],
  );

  function pickFolder(next: string) {
    if (next === NEW) {
      setDraftName("");
      setDialog("folder");
      return;
    }
    setFolder(next);
    if (selected && (selected.groupName || "") !== next) onChange("");
  }

  function pickGroup(next: string) {
    if (next === NEW) {
      setDraftName(defaultCollectionName());
      setKind("exam");
      setDialog("group");
      return;
    }
    onChange(next);
  }

  async function confirmFolder() {
    const name = draftName.trim().slice(0, 40);
    if (!name) return;
    setFolder(name);
    if (selected && selected.groupName !== name) onChange("");
    setDialog(null);
  }

  async function confirmGroup() {
    const name = draftName.trim().slice(0, 40);
    if (!name) return;
    setBusy(true);
    try {
      const id = await addCollection({ name, kind, groupName: folder });
      onChange(id);
      setDialog(null);
    } finally {
      setBusy(false);
    }
  }

  const selectClass = "h-9 min-w-32 max-w-48 rounded-md bg-secondary px-2 text-sm outline-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        大组
        <select
          value={folder}
          onChange={(e) => pickFolder(e.target.value)}
          className={selectClass}
          aria-label="选择大组"
        >
          <option value="">{UNGROUPED_FOLDER}</option>
          {folders.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
          <option value={NEW}>新增大组…</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        小组
        <select
          value={value}
          onChange={(e) => pickGroup(e.target.value)}
          className={selectClass}
          aria-label="选择小组"
        >
          <option value="">不收入组</option>
          {groups.map((item) => (
            <option key={item.id} value={item.id}>
              {COLLECTION_KIND_LABEL[item.kind]} · {item.name}
            </option>
          ))}
          <option value={NEW}>新建小组…</option>
        </select>
      </label>

      <Dialog open={dialog === "folder"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增大组</DialogTitle>
            <DialogDescription>用来区分来源，比如某个机构或某本教材。</DialogDescription>
          </DialogHeader>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="例如：华杯真题"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmFolder();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button onClick={() => void confirmFolder()} disabled={!draftName.trim()}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "group"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建小组</DialogTitle>
            <DialogDescription>
              {folder ? `放到大组「${folder}」` : "先不放大组，之后也能改"}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="例如：2025dly"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmGroup();
            }}
          />
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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button onClick={() => void confirmGroup()} disabled={busy || !draftName.trim()}>
              创建并选中
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
