import { Cents } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { planCoverage, type CoverageCandidate, type CoveragePlan } from './coverage';
import { INSURANCE } from './test-data';
// independent calc: packages/engine/golden/coverage.py, whose output is coverage.json
import EXPECTED from '../golden/coverage.json';

interface Summary {
  allocations: [string, string, number][];
  insured: number;
  uninsured: number;
  used: number;
}

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

const summary = (p: CoveragePlan): Summary => ({
  allocations: p.allocations.map((a) => [a.institutionId, a.category, a.amount]),
  insured: p.insuredTotal,
  uninsured: p.uninsuredTotal,
  used: p.institutionsUsed,
});

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
