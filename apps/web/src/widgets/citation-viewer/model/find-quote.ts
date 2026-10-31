// Ranges of text items that contain `quote` after the same normalization the PDF text layer needs:
// whitespace, case, soft hyphens and the common Latin ligatures.
const LIGATURES: Readonly<Record<string, string>> = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
};

export interface QuoteTextItem {
  str: string;
}

function expand(char: string): string {
  if (char === '\u00AD') return '';
  return LIGATURES[char] ?? char;
}

/** Item indexes that cover the first match, or an empty list when the quote is not on the page. */
export function findQuote(items: readonly QuoteTextItem[], quote: string): number[] {
  const target = normalize(quote);
  if (target === '') return [];
  const owned: number[] = [];
  let norm = '';
  let gap = false;
  items.forEach((item, index) => {
    for (const char of item.str) {
      for (const piece of expand(char)) {
        if (/\s/u.test(piece)) {
          gap = norm.length > 0;
          continue;
        }
        if (gap) {
          norm += ' ';
          owned.push(index);
          gap = false;
        }
        norm += piece.toLowerCase();
        owned.push(index);
      }
    }
    gap = norm.length > 0;
  });
  const at = norm.indexOf(target);
  if (at < 0) return [];
  const hit = new Set<number>();
  for (let i = at; i < at + target.length; i += 1) {
    const index = owned[i];
    if (index !== undefined) hit.add(index);
  }
  return [...hit].sort((a, b) => a - b);
}

function normalize(text: string): string {
  let out = '';
  let gap = false;
  for (const char of text) {
    for (const piece of expand(char)) {
      if (/\s/u.test(piece)) {
        gap = out.length > 0;
        continue;
      }
      if (gap) {
        out += ' ';
        gap = false;
      }
      out += piece.toLowerCase();
    }
  }
  return out;
}
