// The only place apps/web reads the wall clock (ADR-011). Client code only: with cacheComponents,
// server components get time as an `asOf` parameter instead. Tests swap the source.
import { IsoDate } from '@fa/contracts';

let source: () => number = () => Date.now();

export const now = (): Date => new Date(source());

/** The local calendar date, "YYYY-MM-DD". */
export function today(): IsoDate {
  const d = now();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return IsoDate.parse(`${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

/** Tests only: fix the clock at `epochMs`; call with no argument to restore the real one. */
export function setClock(epochMs?: number): void {
  source = epochMs === undefined ? () => Date.now() : () => epochMs;
}
