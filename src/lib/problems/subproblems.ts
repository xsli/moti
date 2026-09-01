export type StemSection = {
  subproblem: number;
  text: string;
};

const SUBPROBLEM_RE = /[（(]\s*(\d{1,2})\s*[）)]/g;

export function splitStemSections(stem: string): StemSection[] {
  const matches = [...stem.matchAll(SUBPROBLEM_RE)];
  if (!matches.length) return [{ subproblem: 0, text: stem }];

  const sections: StemSection[] = [];
  const firstAt = matches[0]?.index ?? 0;
  if (firstAt > 0 && stem.slice(0, firstAt).trim()) {
    sections.push({ subproblem: 0, text: stem.slice(0, firstAt) });
  }
  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? stem.length;
    sections.push({ subproblem: Math.max(1, Number(match[1]) || index + 1), text: stem.slice(start, end) });
  });
  return sections;
}

export function stemSubproblemNumbers(stem: string): number[] {
  return [...new Set(splitStemSections(stem).map((section) => section.subproblem).filter((n) => n > 0))];
}
