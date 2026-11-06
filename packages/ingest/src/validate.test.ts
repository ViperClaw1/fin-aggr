import { describe, expect, it } from 'vitest';
import { rateMoveExceeds } from './rate-move';
import { countGate, validateProducts } from './validate';

const provenance = {
  sourceId: 'src_mock',
  sourceUrl: 'https://example.com/source',
  retrievedAt: '2026-10-26T12:00:00Z',
  verification: { status: 'unverified' },
  isMock: true,
};

function product(apy: string): Record<string, unknown> {
  return {
    id: 'prod_cd_0001',
    institutionId: 'fdic:1',
    category: 'cd',
    name: '12-month CD',
    termMonths: 12,
    tierMode: 'whole_balance',
    tiers: [{ minBalance: 0, maxBalance: null, apy }],
    compounding: 'daily',
    minOpening: 50000,
    maxDeposit: null,
    earlyWithdrawal: { value: { kind: 'none' }, provenance },
    eligibility: { op: 'and', args: [] },
    taxTreatment: 'taxable',
    validFrom: '2026-10-01',
    validTo: null,
    provenance,
  };
}

describe('product bounds', () => {
  it('holds a move of more than 50 basis points and keeps the boundary', () => {
    expect(rateMoveExceeds('0.045', '0.04')).toBe(false);
    expect(rateMoveExceeds('0.0451', '0.04')).toBe(true);
    const moved = validateProducts([product('0.0451')], [product('0.04')]);
    expect(moved.clean).toHaveLength(0);
    expect(moved.suspicious).toEqual([{ key: 'prod_cd_0001', reasons: ['apy move'] }]);
    const edge = validateProducts([product('0.045')], [product('0.04')]);
    expect(edge.clean).toHaveLength(1);
  });

  it('holds an APY above 15%', () => {
    const report = validateProducts([product('0.15000001')], []);
    expect(report.suspicious[0]?.reasons).toEqual(['apy bounds']);
  });

  it('holds a row that fails the product schema', () => {
    const report = validateProducts([{ id: 'broken' }], []);
    expect(report.clean).toHaveLength(0);
    expect(report.suspicious[0]?.key).toBe('broken');
  });

  it('blocks an empty batch and a batch smaller than half', () => {
    expect(countGate(0, 4)).toBe('empty');
    expect(countGate(1, 4)).toBe('shrunk');
    expect(countGate(2, 4)).toBeNull();
  });
});
