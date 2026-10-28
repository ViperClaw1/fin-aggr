// The zod schemas and the zod-free checks must accept exactly the same values (ADR-016 D3).
// Deterministic samples from a small LCG: the alphabet and lengths cover the edge shapes.
import { describe, expect, it } from 'vitest';
import { isId, isIsoDate } from './checks';
import { Cents } from './money/cents';
import { isCents, isRate, isSignedRate } from './money/checks';
import { Rate, SignedRate } from './money/rate';
import { Id, IsoDate } from './primitives';

function* strings(
  seed: number,
  alphabet: string,
  count: number,
  maxLen: number,
): Generator<string> {
  let s = seed;
  const next = (n: number): number => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s % n;
  };
  for (let i = 0; i < count; i += 1) {
    let out = '';
    for (let len = next(maxLen + 1); len > 0; len -= 1)
      out += alphabet.charAt(next(alphabet.length));
    yield out;
  }
}

const agree = (
  schema: { safeParse: (v: unknown) => { success: boolean } },
  check: (v: unknown) => boolean,
  values: Iterable<unknown>,
): unknown[] => [...values].filter((v) => schema.safeParse(v).success !== check(v));

describe('zod schemas and zod-free checks agree', () => {
  it('Rate and SignedRate on decimal-shaped strings', () => {
    const values = [
      ...strings(1, '0123456789.-', 20000, 12),
      '0',
      '1',
      '1.0',
      '-0',
      '-0.0',
      '0.12345678',
      '0.123456789',
      '-1.5',
    ];
    expect(agree(Rate, isRate, values)).toEqual([]);
    expect(agree(SignedRate, isSignedRate, values)).toEqual([]);
  });

  it('Cents on numbers at the edges', () => {
    const values = [
      0,
      -0,
      1,
      -1,
      1.5,
      Number.NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
      -Number.MAX_SAFE_INTEGER,
      '1',
    ];
    expect(agree(Cents, isCents, values)).toEqual([]);
  });

  it('IsoDate on date-shaped strings, including impossible days and leap years', () => {
    const values = [
      ...strings(2, '0123456789-', 20000, 10),
      '2026-02-28',
      '2026-02-29',
      '2024-02-29',
      '1900-02-29',
      '2000-02-29',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
      '0000-01-01',
      '9999-12-31',
    ];
    const pad = (n: number): string => String(n).padStart(2, '0');
    for (const y of ['1900', '2000', '2023', '2024', '2026'])
      for (let m = 0; m <= 13; m += 1)
        for (let d = 0; d <= 32; d += 1) values.push(`${y}-${pad(m)}-${pad(d)}`);
    expect(agree(IsoDate, isIsoDate, values)).toEqual([]);
  });

  it('Id on identifier-shaped strings', () => {
    const values = [
      ...strings(3, 'aZ09:_-. ', 20000, 70),
      'fdic:628',
      'prod_cd_0042',
      `a${'b'.repeat(63)}`,
      `a${'b'.repeat(64)}`,
    ];
    expect(agree(Id, isId, values)).toEqual([]);
  });
});
