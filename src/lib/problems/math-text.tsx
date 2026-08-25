import katex from "katex";
import { useMemo } from "react";
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
}: {
  text: string;
  className?: string;
  inline?: boolean;
}) {
  const pieces = useMemo(() => splitMath(text.replace(/\r\n/g, "\n")), [text]);
  const Tag = inline ? "span" : "div";

  return (
    <Tag className={cn(!inline && "text-pretty leading-relaxed", className)}>
      {pieces.map((piece, index) => {
        if (piece.type === "text") {
          return piece.value.split("\n").map((line, lineIndex, arr) => (
            <span key={`${index}-${lineIndex}`}>
              {line}
              {lineIndex < arr.length - 1 ? <br /> : null}
            </span>
          ));
        }
        return (
          <span
            key={index}
            className={piece.display ? "block my-2 overflow-x-auto" : "math-inline"}
            dangerouslySetInnerHTML={{ __html: renderMath(piece.value, piece.display) }}
          />
        );
      })}
    </Tag>
  );
}
