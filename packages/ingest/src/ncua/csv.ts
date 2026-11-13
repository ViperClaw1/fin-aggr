/** Quoted call-report text. A field may contain a comma. Doubled quotes are one quote. */

function quotedChar(
  src: string,
  index: number,
  field: string,
): { field: string; index: number; quoted: boolean } {
  const char = src[index] ?? '';
  if (char !== '"') return { field: field + char, index, quoted: true };
  if (src[index + 1] === '"') return { field: `${field}"`, index: index + 1, quoted: true };
  return { field, index, quoted: false };
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i] ?? '';
    if (quoted) {
      const next = quotedChar(src, i, field);
      field = next.field;
      i = next.index;
      quoted = next.quoted;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      continue;
    }
    if (char !== '\r') field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function columnIndex(header: readonly string[], name: string): number {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`ncua column ${name}`);
  return index;
}
