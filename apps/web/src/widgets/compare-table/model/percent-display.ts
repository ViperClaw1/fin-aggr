// Two visible decimals for a net yield. The full percent string stays in the tooltip.
// Half-up on the digit string: no binary float (ADR-013).

const MINUS = '−';

function increment(digits: string): string {
  let i = digits.length - 1;
  while (i >= 0 && digits[i] === '9') i -= 1;
  if (i < 0) return `1${'0'.repeat(digits.length)}`;
  const next = String(Number(digits[i]) + 1);
  return `${digits.slice(0, i)}${next}${'0'.repeat(digits.length - i - 1)}`;
}

/** "3.305%" → "3.31%"; "4%" → "4.00%". Keeps a leading minus (ASCII or U+2212). */
export function roundPercentText(percent: string): string {
  const negative = percent.startsWith(MINUS) || percent.startsWith('-');
  const bare = (negative ? percent.slice(1) : percent).replace(/%$/, '');
  const [whole = '0', frac = ''] = bare.split('.');
  const digits = `${frac}000`;
  const hundredths = digits.slice(0, 2);
  const roundUp = (digits[2] ?? '0') >= '5';
  let fracOut = hundredths;
  let wholeOut = whole;
  if (roundUp) {
    if (hundredths === '99') {
      fracOut = '00';
      wholeOut = increment(whole);
    } else {
      fracOut = String(Number(hundredths) + 1).padStart(2, '0');
    }
  }
  const text = `${wholeOut}.${fracOut}%`;
  return negative ? `${MINUS}${text}` : text;
}
