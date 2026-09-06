export type StemSection = {
  subproblem: number;
  text: string;
};

const SUBPROBLEM_RE = /[（(]\s*(\d{1,2})\s*[）)]/g;

function isEscaped(input: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && input[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function findClosing(input: string, delimiter: string, from: number): number {
  let at = input.indexOf(delimiter, from);
  while (at >= 0 && isEscaped(input, at)) at = input.indexOf(delimiter, at + delimiter.length);
  return at;
}

function mathRanges(input: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let i = 0;
  while (i < input.length) {
    const opener = input.startsWith("$$", i)
      ? { open: "$$", close: "$$" }
      : input[i] === "$" && !isEscaped(input, i)
        ? { open: "$", close: "$" }
        : input.startsWith("\\[", i)
          ? { open: "\\[", close: "\\]" }
          : input.startsWith("\\(", i)
            ? { open: "\\(", close: "\\)" }
            : null;
    if (!opener) {
      i++;
      continue;
    }
    const end = findClosing(input, opener.close, i + opener.open.length);
    if (end < 0) {
      i += opener.open.length;
      continue;
    }
    const after = end + opener.close.length;
    ranges.push([i, after]);
    i = after;
  }
  return ranges;
}

export function splitStemSections(stem: string): StemSection[] {
  const protectedRanges = mathRanges(stem);
  const matches = [...stem.matchAll(SUBPROBLEM_RE)].filter((match) => {
    const at = match.index ?? 0;
    return !protectedRanges.some(([start, end]) => at >= start && at < end);
  });
  if (!matches.length) return [{ subproblem: 0, text: stem }];

  const sections: StemSection[] = [];
  const firstAt = matches[0]?.index ?? 0;
  if (firstAt > 0 && stem.slice(0, firstAt).trim()) {
    sections.push({ subproblem: 0, text: stem.slice(0, firstAt) });
  }
  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? stem.length;
    sections.push({
      subproblem: Math.max(1, Number(match[1]) || index + 1),
      text: stem.slice(start, end),
    });
  });
  return sections;
}

export function stemSubproblemNumbers(stem: string): number[] {
  return [
    ...new Set(
      splitStemSections(stem)
        .map((section) => section.subproblem)
        .filter((n) => n > 0),
    ),
  ];
}
