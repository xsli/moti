import type { Figure } from './types';

export function splitInlineFigures(text: string) {
  const parts: Array<{ type: 'text'; value: string } | { type: 'figure'; id: string; alt: string }> = [];
  let start = 0;
  for (const match of text.matchAll(/!\[([^\]\n]*)\]\(figure:([A-Za-z0-9_-]{1,80})\)/g)) {
    if (match.index > start) parts.push({ type: 'text', value: text.slice(start, match.index) });
    parts.push({ type: 'figure', alt: match[1], id: match[2] });
    start = match.index + match[0].length;
  }
  if (start < text.length) parts.push({ type: 'text', value: text.slice(start) });
  return parts;
}

export function inlineFigureImage(figures: Figure[], id: string): string | undefined {
  const image = figures.find(figure => figure.id === id)?.image;
  return image?.startsWith('data:image/') ? image : undefined;
}
