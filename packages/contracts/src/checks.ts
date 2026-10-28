// Primitive brands without zod (ADR-016 D3); the schemas in primitives.ts must agree with these
// (property test in checks.test.ts).
import { ID_RE } from './patterns';
import type { Id, IsoDate } from './primitives';

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isId = (v: unknown): v is Id => typeof v === 'string' && ID_RE.test(v);

/** "YYYY-MM-DD" that exists on the calendar ("2026-02-31" is not). */
export function isIsoDate(v: unknown): v is IsoDate {
  if (typeof v !== 'string') return false;
  const m = ISO_DATE_RE.exec(v);
  if (!m) return false;
  // digit loop: parseInt and Number() are banned in contracts (ADR-013 lint)
  const int = (s = ''): number => {
    let n = 0;
    for (let i = 0; i < s.length; i += 1) n = n * 10 + s.charCodeAt(i) - 48;
    return n;
  };
  const [y, mo, d] = [int(m[1]), int(m[2]), int(m[3])];
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function asIsoDate(text: string): IsoDate {
  if (!isIsoDate(text)) throw new TypeError(`not an ISO date: ${text}`);
  return text;
}
