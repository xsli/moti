import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Search } from "lucide-react";

export function SearchableSelect({ label, value, options, onChange, disabled = false }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild>
      <button type="button" role="combobox" aria-label={label} aria-expanded={open} disabled={disabled} data-value={value}
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-left text-sm text-fg disabled:opacity-50">
        <span className="truncate">{options.find((option) => option.value === value)?.label || "请选择"}</span><ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </Popover.Trigger>
    <Popover.Portal><Popover.Content align="start" sideOffset={4} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-surface shadow-md">
      <Command loop>
        <div className="flex items-center gap-2 border-b border-border px-3"><Search className="size-4 shrink-0 text-muted-foreground" /><Command.Input aria-label={`搜索${label}`} placeholder="搜索…" className="h-10 min-w-0 w-full bg-transparent text-sm outline-none" /></div>
        <Command.List className="max-h-64 overflow-y-auto p-1">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配项</Command.Empty>
          {options.map((option) => <Command.Item key={option.value} value={`${option.label} ${option.value}`} data-option-value={option.value}
            onSelect={() => { onChange(option.value); setOpen(false); }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-secondary">
            <span className="grid size-4 shrink-0 place-items-center">{value === option.value ? <Check className="size-4 text-primary" /> : null}</span><span className="break-words">{option.label}</span>
          </Command.Item>)}
        </Command.List>
      </Command>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
