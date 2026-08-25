import { useEffect, useRef, useState } from "react";
import type { ImageBBox } from "@/lib/image/bbox";
import { cn } from "@/lib/utils";

const MIN = 0.08;

function clamp(box: ImageBBox): ImageBBox {
  const x = Math.min(1 - MIN, Math.max(0, box.x));
  const y = Math.min(1 - MIN, Math.max(0, box.y));
  return {
    x,
    y,
    w: Math.min(1 - x, Math.max(MIN, box.w)),
    h: Math.min(1 - y, Math.max(MIN, box.h)),
  };
}

type Handle = "move" | "nw" | "ne" | "sw" | "se";

export function CropEditor({
  src,
  value,
  onChange,
  onCommit,
}: {
  src: string;
  value: ImageBBox;
  onChange?: (box: ImageBBox) => void;
  onCommit?: (box: ImageBBox) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ handle: Handle; startX: number; startY: number; origin: ImageBBox } | null>(null);
  const boxRef = useRef(value);
  const [box, setBox] = useState(value);

  useEffect(() => {
    setBox(value);
    boxRef.current = value;
  }, [value]);

  function pointerPos(e: { clientX: number; clientY: number }) {
    const rect = (imgRef.current ?? frameRef.current)?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function apply(next: ImageBBox) {
    const clamped = clamp(next);
    boxRef.current = clamped;
    setBox(clamped);
    onChange?.(clamped);
  }

  function onPointerDown(handle: Handle, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = pointerPos(e);
    drag.current = { handle, startX: p.x, startY: p.y, origin: boxRef.current };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const p = pointerPos(e);
    const dx = p.x - drag.current.startX;
    const dy = p.y - drag.current.startY;
    const o = drag.current.origin;
    if (drag.current.handle === "move") {
      apply({ ...o, x: o.x + dx, y: o.y + dy });
      return;
    }
    let { x, y, w, h } = o;
    if (drag.current.handle.includes("w")) {
      x = o.x + dx;
      w = o.w - dx;
    }
    if (drag.current.handle.includes("e")) w = o.w + dx;
    if (drag.current.handle.includes("n")) {
      y = o.y + dy;
      h = o.h - dy;
    }
    if (drag.current.handle.includes("s")) h = o.h + dy;
    apply({ x, y, w, h });
  }

  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    onCommit?.(boxRef.current);
  }

  return (
    <div
      ref={frameRef}
      className="relative w-full select-none overflow-hidden rounded-lg bg-secondary touch-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img ref={imgRef} src={src} alt="原图裁切" className="pointer-events-none block w-full" />
      <div
        className="absolute cursor-move border-2 border-primary"
        style={{
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
          boxShadow: "0 0 0 9999px rgb(26 24 20 / 0.45)",
        }}
        onPointerDown={(e) => onPointerDown("move", e)}
      >
        {(["nw", "ne", "sw", "se"] as const).map((handle) => (
          <span
            key={handle}
            className={cn(
              "absolute size-4 rounded-sm border-2 border-primary bg-surface",
              handle === "nw" && "-left-2 -top-2 cursor-nwse-resize",
              handle === "ne" && "-right-2 -top-2 cursor-nesw-resize",
              handle === "sw" && "-bottom-2 -left-2 cursor-nesw-resize",
              handle === "se" && "-bottom-2 -right-2 cursor-nwse-resize",
            )}
            onPointerDown={(e) => onPointerDown(handle, e)}
          />
        ))}
      </div>
    </div>
  );
}
