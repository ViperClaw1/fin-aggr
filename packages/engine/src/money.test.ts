// Errors, output conversion and properties. Oracles use BigInt only, independent of decimal.js.
import { Cents, Rate } from '@fa/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EngineError, type EngineErrorCode } from './errors';
import { D, mulRate, sumCents, toSignedRate } from './money';

const c = (n: number): Cents => Cents.parse(n);
const MAX = Number.MAX_SAFE_INTEGER;

function codeOf(fn: () => unknown): EngineErrorCode | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
  return undefined;
}

describe('invalid input', () => {
  it('a sum past the safe range is invalid_input', () => {
    expect(codeOf(() => sumCents([c(MAX), c(1)]))).toBe('invalid_input');
  });
  it('a negative sum past the safe range is invalid_input', () => {
    expect(codeOf(() => sumCents([c(-MAX), c(-1)]))).toBe('invalid_input');
  });
  it('fractional cents are invalid_input', () => {
    expect(codeOf(() => sumCents([1.5 as never]))).toBe('invalid_input');
  });
  it.each(['1.5', '-0.1', '1.00000001', '4.35', 'abc'])('rate %s is invalid_rate', (rate) => {
    expect(codeOf(() => mulRate(c(100), rate as never))).toBe('invalid_rate');
  });
  it('an empty sum is zero', () => {
    expect(sumCents([])).toBe(0);
  });
});

describe('toSignedRate', () => {
  it.each([
    ['0.123456785', '0.12345679'],
    ['-0.123456785', '-0.12345679'],
    ['0.10', '0.1'],
    ['-0.000000004', '0'],
    ['-0.000000005', '-0.00000001'],
    ['-1.5', '-1.5'],
    ['0', '0'],
  ])('%s → %s', (input, output) => {
    expect(toSignedRate(new D(input))).toBe(output);
  });
});

// rate as 8-decimal fixed point: n / 1e8, n in [0, 1e8]
const rateArb = fc.integer({ min: 0, max: 100_000_000 }).map((n) => ({
  n: BigInt(n),
  rate: Rate.parse(n === 100_000_000 ? '1' : `0.${String(n).padStart(8, '0')}`),
}));
const amountArb = fc.integer({ min: -1_000_000_000_000, max: 1_000_000_000_000 });

/** p / q rounded half-up (away from zero on a tie), BigInt only. */
function divHalfUp(p: bigint, q: bigint): bigint {
  const abs = p < 0n ? -p : p;
  const rounded = (2n * abs + q) / (2n * q);
  return p < 0n ? -rounded : rounded;
}

describe('properties', () => {
  it('mulRate equals the exact product rounded half-up', () => {
    fc.assert(
      fc.property(amountArb, rateArb, (amount, { n, rate }) => {
        const expected = divHalfUp(BigInt(amount) * n, 100_000_000n);
        expect(BigInt(mulRate(c(amount), rate))).toBe(expected);
      }),
    );
  });
  it('sumCents equals the exact integer sum', () => {
    fc.assert(
      fc.property(fc.array(amountArb, { maxLength: 50 }), (values) => {
        const expected = values.reduce((acc, v) => acc + BigInt(v), 0n);
        expect(BigInt(sumCents(values.map(c)))).toBe(expected);
      }),
    );
  });
});
