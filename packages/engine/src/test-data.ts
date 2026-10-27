// Synthetic inputs shared by engine tests. Not IRS or state values: the golden scripts in
// packages/engine/golden/ use the same numbers.
import {
  Cents,
  EarlyWithdrawal,
  InsuranceRules,
  Product,
  Profile,
  Provenance,
  RateTier,
  TaxTables,
  type FilingStatus,
} from '@fa/contracts';
import type { YieldProduct } from './interest';
import { computeNetYield, type NetYieldInput, type NetYieldResult } from './yield';

const PROVENANCE = Provenance.parse({
  sourceId: 'engine-test',
  sourceUrl: 'https://example.com/sources/engine-test',
  retrievedAt: '2026-10-01T00:00:00Z',
  verification: { status: 'unverified' },
  isMock: true,
});

const RATES = ['0.10', '0.20', '0.30', '0.40'] as const;
const BOUNDS_DOLLARS: Record<FilingStatus, readonly [number, number, number]> = {
  single: [20000, 80000, 200000],
  married_joint: [40000, 160000, 400000],
  married_separate: [20000, 80000, 200000],
  head_of_household: [30000, 100000, 200000],
};

const brackets = (bounds: readonly number[]): { upTo: number | null; rate: string }[] =>
  RATES.map((rate, i) => {
    const upTo = bounds[i];
    return { upTo: upTo === undefined ? null : upTo * 100, rate };
  });

export const TABLES = TaxTables.parse({
  taxYear: 2026,
  federal: Object.fromEntries(Object.entries(BOUNDS_DOLLARS).map(([s, b]) => [s, brackets(b)])),
  states: { CA: { assumedMarginalRate: '0.06' }, TX: { assumedMarginalRate: '0' } },
  provenance: PROVENANCE,
});

/** [min, max | null, apy] in cents and fraction strings */
export const tiers = (...rows: readonly [number, number | null, string][]): RateTier[] =>
  rows.map(([minBalance, maxBalance, apy]) => RateTier.parse({ minBalance, maxBalance, apy }));

/** Three adjacent tiers like the fixtures: [0, 9999.99] 4%, [10000, 99999.99] 4.5%, [100000, ∞) 5%. */
export const THREE_TIERS = tiers(
  [0, 999999, '0.04'],
  [1000000, 9999999, '0.045'],
  [10000000, null, '0.05'],
);

/** A 12-month CD at 5% APY without a penalty; override any field. */
export function cd(overrides: Partial<YieldProduct> = {}): YieldProduct {
  return {
    category: 'cd',
    termMonths: 12,
    tierMode: 'whole_balance',
    tiers: tiers([0, null, '0.05']),
    earlyWithdrawal: EarlyWithdrawal.parse({ kind: 'none' }),
    taxTreatment: 'taxable',
    ...overrides,
  };
}

export interface YieldCase {
  product?: Partial<YieldProduct>;
  principal?: number;
  holdingMonths?: number;
  profile?: Partial<NetYieldInput['profile']>;
}

/** computeNetYield on a 12-month 5% CD, $10,000, single in CA with $50,000 income. */
export function run({
  product,
  principal = 1000000,
  holdingMonths = 12,
  profile,
}: YieldCase = {}): NetYieldResult {
  return computeNetYield({
    product: cd(product),
    principal: Cents.parse(principal),
    holdingMonths,
    profile: {
      filingStatus: 'single',
      stateCode: 'CA',
      taxableIncome: Cents.parse(5000000),
      cityMarginalRate: null,
      ...profile,
    },
    tables: TABLES,
  });
}

/** A full Product (schema-parsed): a 12-month 5% CD open to everyone. */
export function product(
  id: string,
  overrides: Partial<Record<keyof Product, unknown>> = {},
): Product {
  return Product.parse({
    id,
    institutionId: 'fdic:1',
    category: 'cd',
    name: 'Test CD',
    termMonths: 12,
    tierMode: 'whole_balance',
    tiers: [{ minBalance: 0, maxBalance: null, apy: '0.05' }],
    compounding: 'monthly',
    minOpening: 0,
    maxDeposit: null,
    earlyWithdrawal: { value: { kind: 'none' }, provenance: PROVENANCE },
    eligibility: { op: 'and', args: [] },
    taxTreatment: 'taxable',
    validFrom: '2026-10-01',
    validTo: null,
    provenance: PROVENANCE,
    ...overrides,
  });
}

/** Single in CA, $50,000 income, a US citizen aged 40, $10,000 for 12 months. */
export function profile(overrides: Partial<Profile> = {}): Profile {
  return Profile.parse({
    version: 1,
    taxYear: 2026,
    filingStatus: 'single',
    stateCode: 'CA',
    taxableIncome: 5000000,
    cityMarginalRate: null,
    residency: 'us_citizen',
    age: 40,
    scenario: { principal: 1000000, holdingMonths: 12 },
    ...overrides,
  });
}

/** $250,000 per owner, per institution, per category for both regulators (like the fixtures). */
export const INSURANCE = InsuranceRules.parse({
  asOf: '2026-10-01',
  byRegulator: {
    FDIC: { limitPerOwnerPerInstitutionPerCategory: 25000000 },
    NCUA: { limitPerOwnerPerInstitutionPerCategory: 25000000 },
  },
  supportedCategories: ['single', 'joint'],
  jointOwnersAssumed: 2,
  accruedInterestCountsTowardLimit: true,
  provenance: PROVENANCE,
});
