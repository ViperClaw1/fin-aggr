import { Cents, InsuranceRules } from '@fa/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  categoryLimit,
  planCoverage,
  type CoverageCandidate,
  type CoverageInput,
} from './coverage';
import { INSURANCE } from './test-data';

const BANK: CoverageCandidate = {
  institutionId: 'fdic:1',
  regulator: 'FDIC',
  kind: 'direct_bank',
  preference: 1,
};
const base: CoverageInput = {
  accounts: [{ category: 'single', amount: Cents.parse(100) }],
  candidates: [BANK],
  rules: INSURANCE,
  interestReservePerAllocation: Cents.parse(0),
};

describe('categoryLimit', () => {
  it('is the single-owner limit, and twice that for joint', () => {
    // independent calc: the fixture limit is 25_000_000 cents ($250,000); × 2 owners = 50_000_000
    expect(categoryLimit(INSURANCE, 'FDIC', 'single')).toBe(25_000_000);
    expect(categoryLimit(INSURANCE, 'NCUA', 'joint')).toBe(50_000_000);
  });
});

describe('rules and errors', () => {
  it('merges duplicates of one institution, keeping the earliest preference', () => {
    const p = planCoverage({
      ...base,
      accounts: [{ category: 'single', amount: Cents.parse(30000000) }],
      candidates: [{ ...BANK, preference: 5 }, BANK],
    });
    expect([p.insuredTotal, p.institutionsUsed]).toEqual([25000000, 1]);
  });
  it('sums accounts of one category before placing them', () => {
    const p = planCoverage({
      ...base,
      accounts: [
        { category: 'single', amount: Cents.parse(100) },
        { category: 'single', amount: Cents.parse(200) },
      ],
    });
    expect(p.allocations).toEqual([{ institutionId: 'fdic:1', category: 'single', amount: 300 }]);
  });
  it('a reserve above the limit leaves no room, so everything is uninsured', () => {
    const p = planCoverage({ ...base, interestReservePerAllocation: Cents.parse(30000000) });
    expect([p.insuredTotal, p.uninsuredTotal, p.institutionsUsed]).toEqual([0, 100, 0]);
  });
  it('lists every spec assumption, including no pass-through insurance', () => {
    expect(planCoverage(base).assumptions.map((a) => a.id)).toEqual([
      'no_other_deposits',
      'two_joint_owners',
      'limits_from_reference',
      'no_pass_through_insurance',
      'not_legal_advice',
    ]);
  });
  it.each<[string, Partial<CoverageInput>]>([
    ['a negative account', { accounts: [{ category: 'single', amount: Cents.parse(-1) }] }],
    ['a negative reserve', { interestReservePerAllocation: Cents.parse(-1) }],
    ['a fractional maxInstitutions', { maxInstitutions: 1.5 }],
    ['a negative maxInstitutions', { maxInstitutions: -1 }],
    [
      'a category the rules do not cover',
      { rules: InsuranceRules.parse({ ...INSURANCE, supportedCategories: ['joint'] }) },
    ],
  ])('%s is invalid_input', (_, override) => {
    expect(() => planCoverage({ ...base, ...override })).toThrow(/^invalid_input/);
  });
});

const ids = ['fdic:1', 'fdic:2', 'ncua:3', 'fdic:4', 'fin:5', 'fdic:6'] as const;
const candidateArb = fc.record({
  institutionId: fc.constantFrom(...ids),
  regulator: fc.constantFrom('FDIC' as const, 'NCUA' as const),
  kind: fc.constantFrom(
    'direct_bank' as const,
    'credit_union' as const,
    'fintech_partner' as const,
  ),
  preference: fc.integer({ min: 0, max: 5 }),
});
const centsArb = fc.integer({ min: 0, max: 200_000_000 }).map((n) => Cents.parse(n));
const inputArb = fc.record({
  accounts: fc.array(
    fc.record({ category: fc.constantFrom('single' as const, 'joint' as const), amount: centsArb }),
    { maxLength: 4 },
  ),
  candidates: fc.uniqueArray(candidateArb, { maxLength: 6, selector: (c) => c.institutionId }),
  interestReservePerAllocation: fc.integer({ min: 0, max: 30_000_000 }).map((n) => Cents.parse(n)),
});
const full = (i: Omit<CoverageInput, 'rules'>): CoverageInput => ({ ...i, rules: INSURANCE });
const sum = (xs: readonly { amount: number }[]): number => xs.reduce((s, x) => s + x.amount, 0);

describe('properties', () => {
  it('insured + uninsured equals the accounts total', () => {
    fc.assert(
      fc.property(inputArb, (i) => {
        const p = planCoverage(full(i));
        expect(p.insuredTotal + p.uninsuredTotal).toBe(sum(i.accounts));
      }),
    );
  });
  it('no allocation exceeds limit × owners − reserve', () => {
    fc.assert(
      fc.property(inputArb, (i) => {
        for (const a of planCoverage(full(i)).allocations) {
          const limit = a.category === 'joint' ? 50_000_000 : 25_000_000;
          expect(a.amount).toBeLessThanOrEqual(limit - i.interestReservePerAllocation);
        }
      }),
    );
  });
  it('adding a candidate never lowers insuredTotal', () => {
    fc.assert(
      fc.property(inputArb, candidateArb, (i, extra) => {
        const fresh = { ...extra, institutionId: 'fdic:99' };
        const before = planCoverage(full(i)).insuredTotal;
        const after = planCoverage(
          full({ ...i, candidates: [...i.candidates, fresh] }),
        ).insuredTotal;
        expect(after).toBeGreaterThanOrEqual(before);
      }),
    );
  });
  it('a permutation of the candidates does not change the plan', () => {
    fc.assert(
      fc.property(
        inputArb.chain((i) =>
          fc.tuple(
            fc.constant(i),
            fc.shuffledSubarray(i.candidates, {
              minLength: i.candidates.length,
              maxLength: i.candidates.length,
            }),
          ),
        ),
        ([i, shuffled]) => {
          expect(planCoverage(full({ ...i, candidates: shuffled }))).toEqual(planCoverage(full(i)));
        },
      ),
    );
  });
});
