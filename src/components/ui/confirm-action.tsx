import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { type ReactElement, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function ConfirmAction({ children, title, description, onConfirm, confirmLabel = "确认删除" }: {
  children: ReactElement;
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);

  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => {
      if (pending.current) return;
      setError(false);
      setOpen(next);
    }}>
      <AlertDialog.Trigger asChild onClick={(event) => event.stopPropagation()}>
        {children}
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-fg/40" />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg bg-surface p-6 shadow-[var(--shadow-border-hover)]"
          onClick={(event) => event.stopPropagation()}
          onEscapeKeyDown={(event) => { if (pending.current) event.preventDefault(); }}
        >
          <AlertDialog.Title className="break-words font-display text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="break-words text-sm text-muted-foreground">{description}</AlertDialog.Description>
          {error ? <p role="alert" className="text-sm text-destructive">操作失败，请重试。未成功删除的内容仍会保留。</p> : null}
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="outline" disabled={busy}>取消</Button>
            </AlertDialog.Cancel>
            <Button type="button" className="bg-destructive text-white hover:bg-destructive/90" disabled={busy} onClick={() => void confirm()}>
              {busy ? "处理中…" : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
