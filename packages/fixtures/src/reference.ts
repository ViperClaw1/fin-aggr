// Reference data. Tax tables are SYNTHETIC (round numbers, not IRS or state values). The deposit
// insurance limit is the one reference constant: isMock false, unverified until checked (AC-5).
import {
  FilingStatus,
  IsoDate,
  type InsuranceRules,
  type SourceRegistryEntry,
  type TaxBracket,
  type TaxTables,
} from '@fa/contracts';
import { RETRIEVED_AT, STATE_CODES, bps, dollars, mockProvenance } from './common';
import type { Rng } from './prng';

const SYNTHETIC_RATES_BPS = [1000, 2000, 3000, 4000] as const;
const BOUNDS_DOLLARS: Record<FilingStatus, readonly [number, number, number]> = {
  single: [20000, 80000, 200000],
  married_joint: [40000, 160000, 400000],
  married_separate: [20000, 80000, 200000],
  head_of_household: [30000, 100000, 200000],
};
const STATE_RATES_BPS = [0, 200, 400, 600] as const;

const brackets = (bounds: readonly number[]): TaxBracket[] =>
  SYNTHETIC_RATES_BPS.map((rate, i) => {
    const upTo = bounds[i];
    return { upTo: upTo === undefined ? null : dollars(upTo), rate: bps(rate) };
  });

export function generateTaxTables(rng: Rng): TaxTables {
  const federal = Object.fromEntries(
    FilingStatus.options.map((s) => [s, brackets(BOUNDS_DOLLARS[s])]),
  ) as TaxTables['federal'];
  const states = Object.fromEntries(
    STATE_CODES.map((code) => [code, { assumedMarginalRate: bps(rng.pick(STATE_RATES_BPS)) }]),
  );
  return { taxYear: 2026, federal, states, provenance: mockProvenance('synthetic-tax-tables') };
}

const INSURANCE_LIMIT = dollars(250000);

export const insuranceRules = (): InsuranceRules => ({
  asOf: IsoDate.parse('2026-10-01'),
  byRegulator: {
    FDIC: { limitPerOwnerPerInstitutionPerCategory: INSURANCE_LIMIT },
    NCUA: { limitPerOwnerPerInstitutionPerCategory: INSURANCE_LIMIT },
  },
  supportedCategories: ['single', 'joint'],
  jointOwnersAssumed: 2,
  accruedInterestCountsTowardLimit: true,
  provenance: {
    sourceId: 'insurance-limit-reference',
    sourceUrl: 'https://www.fdic.gov/resources/deposit-insurance/faq/index.html',
    retrievedAt: RETRIEVED_AT,
    verification: { status: 'unverified' },
    isMock: false,
  },
});

const mockSource = (id: string, name: string, notes: string): SourceRegistryEntry => ({
  id,
  name,
  url: `https://example.com/sources/${id}`,
  kind: 'manual',
  license: 'n/a',
  lastUpdatedAt: RETRIEVED_AT,
  notes,
});

export const sources = (): SourceRegistryEntry[] => [
  mockSource(
    'synthetic-tax-tables',
    'Synthetic tax tables',
    'synthetic federal brackets and state rates, not a tax table',
  ),
  {
    id: 'insurance-limit-reference',
    name: 'Deposit insurance limit (12 CFR 330, 12 CFR 745)',
    url: 'https://www.fdic.gov/resources/deposit-insurance/faq/index.html',
    kind: 'official_document',
    license: 'public domain',
    lastUpdatedAt: null,
    notes: 'reference constant, unverified; verify against 12 CFR 330 and 12 CFR 745 before launch',
  },
  mockSource('mock-institution-registry', 'Mock institution registry', 'fictional institutions'),
  mockSource('mock-issuer-rates', 'Mock issuer rate sheets', 'synthetic rates'),
  mockSource('mock-issuer-documents', 'Mock issuer documents', 'synthetic documents written by us'),
  mockSource('mock-call-reports', 'Mock call reports', 'synthetic bank metrics'),
];
