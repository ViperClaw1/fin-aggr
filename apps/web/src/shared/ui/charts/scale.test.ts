import { Cents, parseRate } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import type { BulletChartProps } from './bullet-chart';
import { isOver, position } from './scale';

const usd = (n: number) => Cents.parse(n);

describe('position', () => {
  it('maps 0, the middle and max to 0, 50 and 100', () => {
    const max = usd(25_000_000);
    expect(position(usd(0), max)).toBe(0);
    expect(position(usd(12_500_000), max)).toBe(50);
    expect(position(max, max)).toBe(100);
  });

  it('clamps past max to 100 and below zero to 0', () => {
    expect(position(usd(30_000_000), usd(25_000_000))).toBe(100);
    expect(position(usd(-500), usd(25_000_000))).toBe(0);
  });

  it('reads rates by value: trailing zeros do not matter', () => {
    const max = parseRate('0.1');
    expect(position(parseRate('0.0450'), max)).toBeCloseTo(45, 10);
    expect(position(parseRate('0.045'), max)).toBeCloseTo(45, 10);
  });

  it('stays finite for cents near the safe integer limit', () => {
    const max = usd(Number.MAX_SAFE_INTEGER);
    expect(position(usd(Math.floor(Number.MAX_SAFE_INTEGER / 2)), max)).toBeCloseTo(50, 6);
  });

  it('rejects a zero max as a developer error', () => {
    expect(() => position(usd(1), usd(0))).toThrow(/max must be > 0/);
    expect(() => position(parseRate('0.01'), parseRate('0'))).toThrow(/max must be > 0/);
  });
});

describe('BulletChartProps', () => {
  it('does not let a usd chart take a Rate (checked by typecheck)', () => {
    // @ts-expect-error a usd chart accepts only Cents, not a Rate
    const bad: BulletChartProps = {
      kind: 'usd',
      label: 'Mixed',
      max: usd(100),
      value: parseRate('0.1'),
    };
    expect(bad.kind).toBe('usd');
  });
});

describe('isOver', () => {
  it('is true only past max', () => {
    expect(isOver(usd(25_000_001), usd(25_000_000))).toBe(true);
    expect(isOver(usd(25_000_000), usd(25_000_000))).toBe(false);
  });
});
