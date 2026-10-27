import { Cents } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { planCoverage, type CoverageCandidate, type CoveragePlan } from './coverage';
import { INSURANCE } from './test-data';

type Expected = [
  allocations: [string, string, number][],
  insured: number,
  uninsured: number,
  used: number,
];

// independent calc: packages/engine/golden/coverage.py
const EXPECTED = {
  atLimit: [[['fdic:1', 'single', 25000000]], 25000000, 0, 1],
  centAbove: [[['fdic:1', 'single', 25000000]], 25000000, 1, 1],
  centAboveTwoBanks: [
    [
      ['fdic:1', 'single', 25000000],
      ['fdic:2', 'single', 1],
    ],
    25000001,
    0,
    2,
  ],
  reserve: [
    [
      ['fdic:1', 'single', 24900000],
      ['fdic:2', 'single', 100000],
    ],
    25000000,
    0,
    2,
  ],
  joint: [[['fdic:1', 'joint', 50000000]], 50000000, 0, 1],
  maxInstitutions: [
    [
      ['fdic:1', 'single', 25000000],
      ['fdic:2', 'single', 25000000],
    ],
    50000000,
    30000000,
    2,
  ],
  fintech: [[['fdic:1', 'single', 10000000]], 10000000, 0, 1],
  bothCategoriesOneInstitution: [
    [
      ['fdic:1', 'single', 25000000],
      ['fdic:1', 'joint', 50000000],
    ],
    75000000,
    15000000,
    1,
  ],
} satisfies Record<string, Expected>;

const BANKS: CoverageCandidate[] = [
  { institutionId: 'fdic:1', regulator: 'FDIC', kind: 'direct_bank', preference: 1 },
  { institutionId: 'fdic:2', regulator: 'FDIC', kind: 'direct_bank', preference: 2 },
  { institutionId: 'ncua:3', regulator: 'NCUA', kind: 'credit_union', preference: 3 },
  { institutionId: 'fdic:4', regulator: 'FDIC', kind: 'direct_bank', preference: 4 },
];
const FINTECH: CoverageCandidate = {
  institutionId: 'fin:9',
  regulator: 'FDIC',
  kind: 'fintech_partner',
  preference: 0,
};

interface Case {
  single?: number;
  joint?: number;
  candidates: readonly CoverageCandidate[];
  reserve?: number;
  maxInstitutions?: number;
}

function plan({ single, joint, candidates, reserve = 0, maxInstitutions }: Case): CoveragePlan {
  const accounts = [
    ...(single === undefined ? [] : [{ category: 'single' as const, amount: Cents.parse(single) }]),
    ...(joint === undefined ? [] : [{ category: 'joint' as const, amount: Cents.parse(joint) }]),
  ];
  return planCoverage({
    accounts,
    candidates,
    rules: INSURANCE,
    interestReservePerAllocation: Cents.parse(reserve),
    ...(maxInstitutions === undefined ? {} : { maxInstitutions }),
  });
}

const summary = (p: CoveragePlan): Expected => [
  p.allocations.map((a) => [a.institutionId, a.category, a.amount]),
  p.insuredTotal,
  p.uninsuredTotal,
  p.institutionsUsed,
];

describe('planCoverage golden cases', () => {
  it('golden: exactly the limit is fully insured', () => {
    expect(summary(plan({ single: 25000000, candidates: BANKS.slice(0, 1) }))).toEqual(
      EXPECTED.atLimit,
    );
  });
  it('golden: one cent above the limit at one bank is uninsured', () => {
    expect(summary(plan({ single: 25000001, candidates: BANKS.slice(0, 1) }))).toEqual(
      EXPECTED.centAbove,
    );
  });
  it('golden: one cent above the limit spills to the second bank', () => {
    expect(summary(plan({ single: 25000001, candidates: BANKS.slice(0, 2) }))).toEqual(
      EXPECTED.centAboveTwoBanks,
    );
  });
  it('golden: the interest reserve lowers the room at each bank', () => {
    const p = plan({ single: 25000000, candidates: BANKS.slice(0, 2), reserve: 100000 });
    expect(summary(p)).toEqual(EXPECTED.reserve);
  });
  it('golden: joint accounts get the limit times two owners', () => {
    expect(summary(plan({ joint: 50000000, candidates: BANKS.slice(0, 1) }))).toEqual(
      EXPECTED.joint,
    );
  });
  it('golden: maxInstitutions caps the banks used', () => {
    const p = plan({ single: 80000000, candidates: BANKS, maxInstitutions: 2 });
    expect(summary(p)).toEqual(EXPECTED.maxInstitutions);
  });
  it('golden: a fintech partner is skipped with a warning', () => {
    const p = plan({ single: 10000000, candidates: [FINTECH, BANKS[0]!] });
    expect(summary(p)).toEqual(EXPECTED.fintech);
    expect(p.warnings).toEqual([
      'fin:9 is a fintech partner: pass-through insurance is not modeled, so it was skipped.',
    ]);
  });
  it('golden: one institution covers each category separately', () => {
    const p = plan({
      single: 30000000,
      joint: 60000000,
      candidates: BANKS.slice(0, 2),
      maxInstitutions: 1,
    });
    expect(summary(p)).toEqual(EXPECTED.bothCategoriesOneInstitution);
  });
});
