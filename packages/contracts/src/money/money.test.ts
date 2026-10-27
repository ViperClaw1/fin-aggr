// Expected values are spec literals (§5 money, ADR-013) or derived by hand; none come from this code.
import { describe, expect, it } from 'vitest';
import { Cents } from './cents';
import { MoneyParseError, type MoneyParseErrorCode } from './errors';
import { formatRate, formatUsd } from './format';
import { centsFromInteger, parseCents, parseRate, rateFromPercent } from './parse';
import { Rate, SignedRate } from './rate';

const MAX = Number.MAX_SAFE_INTEGER; // 9007199254740991 cents = $90,071,992,547,409.91

function codeOf(fn: () => unknown): MoneyParseErrorCode | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof MoneyParseError) return e.code;
    throw e;
  }
  return undefined;
}

describe('Cents schema', () => {
  it('accepts safe integers including negatives', () => {
    expect(Cents.safeParse(-500).success).toBe(true);
    expect(Cents.safeParse(MAX).success).toBe(true);
  });
  it('rejects fractions and unsafe integers', () => {
    expect(Cents.safeParse(1.5).success).toBe(false);
    expect(Cents.safeParse(MAX + 1).success).toBe(false);
  });
});

describe('Rate schema', () => {
  it.each(['0', '1', '0.0435', '0.0400', '0.00000001', '1.00000000'])('accepts %s', (s) => {
    expect(Rate.safeParse(s).success).toBe(true);
  });
  it.each(['1.00000001', '1.5', '-0.01', '0.000000001', '4.35', '.5', '1e-2', '+0.1', ''])(
    'rejects %s',
    (s) => {
      expect(Rate.safeParse(s).success).toBe(false);
    },
  );
});

describe('parseCents', () => {
  it.each([
    ['1,234.56', 123456],
    ['0', 0],
    ['-0', 0],
    ['12.5', 1250],
    ['  12.50 ', 1250],
    ['$7', 700],
    ['-$0.05', -5],
    ['1,000,000', 100000000],
    ['007.10', 710],
    ['90071992547409.91', MAX],
    ['1.500', 150],
    ['1.50000', 150],
  ])('%s → %i', (input, cents) => {
    expect(parseCents(input)).toBe(cents);
  });

  it('never returns negative zero', () => {
    expect(Object.is(parseCents('-0.00'), 0)).toBe(true);
  });

  it.each([
    ['1.234', 'too_many_decimals'],
    ['1.2301', 'too_many_decimals'],
    ['1,23.45', 'invalid_format'],
    ['1,23.456', 'invalid_format'],
    ['1 234', 'invalid_format'],
    ['abc', 'invalid_format'],
    ['', 'invalid_format'],
    ['1e3', 'invalid_format'],
    ['90071992547409.92', 'out_of_range'],
  ] as const)('%s → %s', (input, code) => {
    expect(codeOf(() => parseCents(input))).toBe(code);
  });
});

describe('SignedRate schema', () => {
  it.each(['0', '-0.0123', '0.0435', '-1.5', '12', '-0.00000001', '0.10'])('accepts %s', (s) => {
    expect(SignedRate.safeParse(s).success).toBe(true);
  });
  it.each(['-0', '-0.0', '-0.00000000', '0.000000001', '01', '+0.1', '1e-2', '.5', ''])(
    'rejects %s',
    (s) => {
      expect(SignedRate.safeParse(s).success).toBe(false);
    },
  );
});

describe('centsFromInteger', () => {
  it.each([
    ['0', 0],
    ['150', 150],
    ['-150', -150],
    ['007', 7],
    ['9007199254740991', MAX],
    ['-9007199254740991', -MAX],
  ])('%s → %i', (input, cents) => {
    expect(centsFromInteger(input)).toBe(cents);
  });

  it('never returns negative zero', () => {
    expect(Object.is(centsFromInteger('-0'), 0)).toBe(true);
  });

  it.each([
    ['1.5', 'invalid_format'],
    ['1,000', 'invalid_format'],
    [' 1', 'invalid_format'],
    ['', 'invalid_format'],
    ['1e3', 'invalid_format'],
    ['9007199254740992', 'out_of_range'],
    ['-9007199254740992', 'out_of_range'],
  ] as const)('%s → %s', (input, code) => {
    expect(codeOf(() => centsFromInteger(input))).toBe(code);
  });
});

describe('parseRate', () => {
  it('returns the fraction unchanged, trailing zeros kept', () => {
    expect(parseRate('0.0435')).toBe('0.0435');
    expect(parseRate(' 0.0400 ')).toBe('0.0400');
  });
  it.each([
    ['1.00000001', 'out_of_range'],
    ['4.35', 'out_of_range'],
    ['2', 'out_of_range'],
    ['0.123456789', 'too_many_decimals'],
    ['-0.1', 'invalid_format'],
    ['01', 'invalid_format'],
    ['00.5', 'invalid_format'],
    ['x', 'invalid_format'],
  ] as const)('%s → %s', (input, code) => {
    expect(codeOf(() => parseRate(input))).toBe(code);
  });
});

describe('rateFromPercent', () => {
  it.each([
    ['4.35', '0.0435'],
    ['4', '0.04'],
    ['4.350', '0.0435'],
    ['100', '1'],
    ['100.000', '1'],
    ['0', '0'],
    ['0.5', '0.005'],
    ['12.345678', '0.12345678'],
    ['0.000001', '0.00000001'],
  ])('%s%% → %s', (input, rate) => {
    expect(rateFromPercent(input)).toBe(rate);
  });
  it.each([
    ['100.01', 'out_of_range'],
    ['150', 'out_of_range'],
    ['0.0000001', 'too_many_decimals'],
    ['-1', 'invalid_format'],
    ['4,35', 'invalid_format'],
  ] as const)('%s → %s', (input, code) => {
    expect(codeOf(() => rateFromPercent(input))).toBe(code);
  });
});

describe('formatUsd', () => {
  it.each([
    [123456, '$1,234.56'],
    [0, '$0.00'],
    [5, '$0.05'],
    [-5, '-$0.05'],
    [100000000, '$1,000,000.00'],
    [MAX, '$90,071,992,547,409.91'],
  ])('%i → %s', (cents, text) => {
    expect(formatUsd(Cents.parse(cents))).toBe(text);
  });
});

describe('round trips over a seeded sample', () => {
  // Deterministic LCG (Numerical Recipes constants); BigInt keeps it exact.
  function* sample(seed: bigint, count: number, modulo: bigint): Generator<bigint> {
    let state = seed;
    for (let i = 0; i < count; i += 1) {
      state = (state * 1664525n + 1013904223n) % 4294967296n;
      yield (state * 2097152n + state) % modulo;
    }
  }

  it('formatUsd(parseCents(s)) === s for canonical strings', () => {
    for (const n of sample(20261025n, 500, 2n * BigInt(MAX) + 1n)) {
      const signed = n - BigInt(MAX);
      const abs = signed < 0n ? -signed : signed;
      const dollars = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const cents = (abs % 100n).toString().padStart(2, '0');
      const text = `${signed < 0n ? '-' : ''}$${dollars}.${cents}`;
      expect(formatUsd(parseCents(text))).toBe(text);
    }
  });

  it('rateFromPercent(formatRate(r)) equals r without trailing zeros', () => {
    for (const n of sample(42n, 500, 100000001n)) {
      const digits = n.toString().padStart(9, '0');
      const text = `${digits.slice(0, 1)}.${digits.slice(1)}`.replace(/\.?0+$/, '');
      const rate = Rate.parse(text === '' ? '0' : text);
      expect(rateFromPercent(formatRate(rate).slice(0, -1))).toBe(rate);
    }
  });
});

describe('formatRate', () => {
  it.each([
    ['0.0435', '4.35%'],
    ['0.0400', '4%'],
    ['0.04', '4%'],
    ['1', '100%'],
    ['1.00000000', '100%'],
    ['0', '0%'],
    ['0.5', '50%'],
    ['0.00000001', '0.000001%'],
  ])('%s → %s', (rate, text) => {
    expect(formatRate(Rate.parse(rate))).toBe(text);
  });
});
