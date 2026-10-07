import katex from "katex";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MathPiece =
  | { type: "text"; value: string }
  | { type: "math"; value: string; display: boolean };

const ENV_RE = /\\begin\{(array|aligned|cases|pmatrix|bmatrix|vmatrix|matrix|smallmatrix)\}/;

function findEnvEnd(input: string, start: number, name: string): number {
  const tag = `\\end{${name}}`;
  const at = input.indexOf(tag, start);
  return at === -1 ? -1 : at + tag.length;
}

function splitMath(input: string): MathPiece[] {
  const pieces: MathPiece[] = [];
  let i = 0;
  while (i < input.length) {
    const dd = input.indexOf("$$", i);
    const br = input.indexOf("\\[", i);
    const ds = input.indexOf("$", i);
    const envMatch = input.slice(i).match(ENV_RE);
    const envAt = envMatch && envMatch.index !== undefined ? i + envMatch.index : -1;

    const candidates = [
      dd >= 0 ? { at: dd, kind: "dd" as const } : null,
      br >= 0 ? { at: br, kind: "br" as const } : null,
      ds >= 0 && (dd !== ds) ? { at: ds, kind: "ds" as const } : null,
      envAt >= 0 ? { at: envAt, kind: "env" as const, name: envMatch![1] } : null,
    ].filter((x): x is NonNullable<typeof x> => x !== null);

    if (!candidates.length) {
      pieces.push({ type: "text", value: input.slice(i) });
      break;
    }
    candidates.sort((a, b) => a.at - b.at);
    const next = candidates[0];
    if (next.at > i) {
      pieces.push({ type: "text", value: input.slice(i, next.at) });
    }
    if (next.kind === "dd") {
      const end = input.indexOf("$$", next.at + 2);
      if (end === -1) {
        pieces.push({ type: "text", value: input.slice(next.at) });
        break;
      }
      pieces.push({ type: "math", value: input.slice(next.at + 2, end), display: true });
      i = end + 2;
      continue;
    }
    if (next.kind === "br") {
      const end = input.indexOf("\\]", next.at + 2);
      if (end === -1) {
        pieces.push({ type: "text", value: input.slice(next.at) });
        break;
      }
      pieces.push({ type: "math", value: input.slice(next.at + 2, end), display: true });
      i = end + 2;
      continue;
    }
    if (next.kind === "env") {
      const end = findEnvEnd(input, next.at, next.name);
      if (end === -1) {
        pieces.push({ type: "text", value: input.slice(next.at) });
        break;
      }
      pieces.push({ type: "math", value: input.slice(next.at, end), display: true });
      i = end;
      continue;
    }
    const end = input.indexOf("$", next.at + 1);
    if (end === -1) {
      pieces.push({ type: "text", value: input.slice(next.at) });
      break;
    }
    pieces.push({ type: "math", value: input.slice(next.at + 1, end), display: false });
    i = end + 1;
  }
  return pieces;
}

function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      output: "html",
    });
  } catch {
    return tex;
  }
}

export function splitMathPieces(input: string): MathPiece[] {
  return splitMath(input.replace(/\r\n/g, "\n"));
}

export function MathText({
  text,
  className,
  inline = false,
  compact = false,
  tight = false,
  scrollHints = false,
}: {
  text: string;
  className?: string;
  inline?: boolean;
  compact?: boolean;
  tight?: boolean;
  scrollHints?: boolean;
}) {
  const pieces = useMemo(() => splitMath(text.replace(/\r\n/g, "\n")), [text]);
  const Tag = scrollHints ? MathScroll : inline ? "span" : "div";

  return (
    <Tag className={cn(!inline && "text-pretty leading-relaxed", compact && "math-compact", className)}>
      {pieces.map((piece, index) => {
        if (piece.type === "text") {
          const previous = pieces[index - 1];
          const next = pieces[index + 1];
          let value = piece.value;
          if (tight) {
            value = value.replace(/\n{3,}/g, "\n\n");
            if (previous?.type === "math" && previous.display) value = value.replace(/^\n+/, "");
            if (next?.type === "math" && next.display) value = value.replace(/\n+$/, "");
          }
          return value.split("\n").map((line, lineIndex, arr) => (
            <span key={`${index}-${lineIndex}`}>
              {line}
              {lineIndex < arr.length - 1 ? <br /> : null}
            </span>
          ));
        }
        if (piece.display && scrollHints) return <MathScroll key={index} className="math-equation my-2"><span dangerouslySetInnerHTML={{ __html: renderMath(piece.value, true) }} /></MathScroll>;
        return (
          <span
            key={index}
            className={
              piece.display
                ? cn("block my-2", compact ? "overflow-hidden" : "overflow-x-auto")
                : "math-inline"
            }
            dangerouslySetInnerHTML={{ __html: renderMath(piece.value, piece.display) }}
          />
        );
      })}
    </Tag>
  );
}

function MathScroll({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false, overflow: false });
  function update() {
    const node = root.current;
    if (!node) return;
    const next = { left: node.scrollLeft > 1, right: node.scrollLeft + node.clientWidth < node.scrollWidth - 1, overflow: node.scrollWidth > node.clientWidth + 1 };
    setEdges((previous) => previous.left === next.left && previous.right === next.right && previous.overflow === next.overflow ? previous : next);
  }
  useEffect(() => {
    if (!root.current) return;
    let live = true;
    const observer = new ResizeObserver(update);
    observer.observe(root.current);
    for (const node of root.current.querySelectorAll(".base")) observer.observe(node);
    void document.fonts.ready.then(() => { if (live) update(); });
    update();
    return () => { live = false; observer.disconnect(); };
  }, [children]);
  return <span ref={root} onScroll={update} tabIndex={edges.overflow ? 0 : undefined} aria-label={edges.overflow ? "公式内容，可横向滚动" : undefined}
    data-scroll-left={edges.left} data-scroll-right={edges.right} className={cn("block min-w-0 overflow-x-auto overflow-y-hidden", edges.overflow && "math-scrollable", className)}>{children}</span>;
}
