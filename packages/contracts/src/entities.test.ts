import { describe, expect, it } from 'vitest';
import { Assumption, CalcStep } from './calc';
import {
  BankMetrics,
  DocumentMeta,
  EarlyWithdrawal,
  FactRecord,
  Institution,
  Product,
  RateTier,
} from './entities';
import { Profile } from './profile';
import { InsuranceRules, SourceRegistryEntry, TaxTables } from './reference';

const provenance = {
  sourceId: 'src_mock',
  sourceUrl: 'https://example.com/source',
  retrievedAt: '2026-10-26T12:00:00Z',
  verification: { status: 'unverified' },
  isMock: true,
};

const institution = {
  id: 'fdic:1',
  name: 'Example Bank',
  regulator: 'FDIC',
  kind: 'direct_bank',
  partnerInstitutionIds: [],
  hqState: 'DE',
  website: null,
  provenance,
};

const product = {
  id: 'prod_cd_0001',
  institutionId: 'fdic:1',
  category: 'cd',
  name: '12-month CD',
  termMonths: 12,
  tierMode: 'whole_balance',
  tiers: [
    { minBalance: 0, maxBalance: 999999, apy: '0.04' },
    { minBalance: 1000000, maxBalance: null, apy: '0.0425' },
  ],
  compounding: 'daily',
  minOpening: 50000,
  maxDeposit: null,
  earlyWithdrawal: { value: { kind: 'days_of_interest', days: 90 }, provenance },
  eligibility: { op: 'and', args: [] },
  taxTreatment: 'taxable',
  validFrom: '2026-10-01',
  validTo: null,
  provenance,
};

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown): boolean =>
  schema.safeParse(v).success;

describe('Institution', () => {
  it('accepts a direct bank', () => {
    expect(ok(Institution, institution)).toBe(true);
  });
  it('rejects a commercial key and a 3-letter state', () => {
    expect(ok(Institution, { ...institution, affiliateId: 'x' })).toBe(false);
    expect(ok(Institution, { ...institution, hqState: 'DEL' })).toBe(false);
  });
});

describe('BankMetrics', () => {
  const metrics = {
    institutionId: 'fdic:1',
    asOf: '2026-09-30',
    totalAssetsUsdThousands: 1200000,
    metrics: {
      tier1LeverageRatio: {
        value: { value: 9.1, marketMedian: 10.2, marketMean: 10.8, percentile: 35 },
        provenance,
      },
    },
    balanceSheetMix: [{ label: 'Loans', share: 0.6 }],
    provenance,
  };
  it('accepts a partial set of metrics', () => {
    expect(ok(BankMetrics, metrics)).toBe(true);
  });
  it('rejects an unknown metric and a share above 1', () => {
    expect(
      ok(BankMetrics, { ...metrics, metrics: { madeUp: metrics.metrics.tier1LeverageRatio } }),
    ).toBe(false);
    expect(ok(BankMetrics, { ...metrics, balanceSheetMix: [{ label: 'x', share: 1.2 }] })).toBe(
      false,
    );
  });
});

describe('RateTier and EarlyWithdrawal', () => {
  it('rejects maxBalance below minBalance and a negative balance', () => {
    expect(ok(RateTier, { minBalance: 100, maxBalance: 99, apy: '0.01' })).toBe(false);
    expect(ok(RateTier, { minBalance: -1, maxBalance: null, apy: '0.01' })).toBe(false);
  });
  it('requires the field matching the penalty kind', () => {
    expect(ok(EarlyWithdrawal, { kind: 'percent_of_principal', rate: '0.01' })).toBe(true);
    expect(ok(EarlyWithdrawal, { kind: 'months_of_interest', days: 3 })).toBe(false);
  });
});

describe('Product', () => {
  it('accepts a tiered CD', () => {
    expect(ok(Product, product)).toBe(true);
  });
  it('rejects overlapping, unsorted or open-ended middle tiers', () => {
    const overlap = [
      { minBalance: 0, maxBalance: 1000, apy: '0.04' },
      { minBalance: 1000, maxBalance: null, apy: '0.04' },
    ];
    const openMiddle = [
      { minBalance: 0, maxBalance: null, apy: '0.04' },
      { minBalance: 1000, maxBalance: null, apy: '0.04' },
    ];
    expect(ok(Product, { ...product, tiers: overlap })).toBe(false);
    expect(ok(Product, { ...product, tiers: [...product.tiers].reverse() })).toBe(false);
    expect(ok(Product, { ...product, tiers: openMiddle })).toBe(false);
  });
  it('rejects validTo before validFrom', () => {
    expect(ok(Product, { ...product, validTo: '2026-09-30' })).toBe(false);
  });
  it('requires a term for cd and treasury and forbids it for savings', () => {
    expect(ok(Product, { ...product, termMonths: null })).toBe(false);
    expect(ok(Product, { ...product, category: 'treasury', termMonths: null })).toBe(false);
    expect(ok(Product, { ...product, category: 'savings', termMonths: 12 })).toBe(false);
    expect(ok(Product, { ...product, category: 'savings', termMonths: null })).toBe(true);
  });
  it('rejects maxDeposit below minOpening and a sponsorship key', () => {
    expect(ok(Product, { ...product, maxDeposit: 100 })).toBe(false);
    expect(ok(Product, { ...product, sponsored: true })).toBe(false);
  });
});

describe('DocumentMeta and FactRecord', () => {
  const doc = {
    id: 'doc_1',
    title: 'Deposit account agreement',
    publisherInstitutionId: 'fdic:1',
    pages: 12,
    fileUrl: '/docs/doc_1.pdf',
    publishedAt: null,
    isSynthetic: true,
  };
  const factRecord = {
    id: 'fact_1',
    productId: 'prod_cd_0001',
    documentId: 'doc_1',
    key: 'earlyWithdrawalPenalty',
    humanLabel: 'Early withdrawal penalty',
    valueText: '90 days of interest',
    page: 4,
    quote: 'A penalty equal to 90 days of interest applies.',
    status: 'unverified',
    isMock: true,
  };
  it('accept valid records', () => {
    expect(ok(DocumentMeta, doc)).toBe(true);
    expect(ok(FactRecord, factRecord)).toBe(true);
  });
  it('reject zero pages and an unknown fact key', () => {
    expect(ok(DocumentMeta, { ...doc, pages: 0 })).toBe(false);
    expect(ok(FactRecord, { ...factRecord, key: 'payout' })).toBe(false);
  });
});

describe('reference data', () => {
  const brackets = [{ upTo: null, rate: '0.1' }];
  const taxTables = {
    taxYear: 2026,
    federal: {
      single: brackets,
      married_joint: brackets,
      married_separate: brackets,
      head_of_household: brackets,
    },
    states: { TX: { assumedMarginalRate: '0' } },
    provenance,
  };
  it('TaxTables requires every filing status', () => {
    expect(ok(TaxTables, taxTables)).toBe(true);
    expect(ok(TaxTables, { ...taxTables, federal: { single: brackets } })).toBe(false);
  });
  it('InsuranceRules pins joint owners to 2', () => {
    const rules = {
      asOf: '2026-10-01',
      byRegulator: {
        FDIC: { limitPerOwnerPerInstitutionPerCategory: 1 },
        NCUA: { limitPerOwnerPerInstitutionPerCategory: 1 },
      },
      supportedCategories: ['single', 'joint'],
      jointOwnersAssumed: 2,
      accruedInterestCountsTowardLimit: true,
      provenance,
    };
    expect(ok(InsuranceRules, rules)).toBe(true);
    expect(ok(InsuranceRules, { ...rules, jointOwnersAssumed: 3 })).toBe(false);
  });
  it('SourceRegistryEntry rejects an unknown kind', () => {
    const entry = {
      id: 'src_1',
      name: 'Mock',
      url: 'https://example.com',
      kind: 'manual',
      license: 'n/a',
      lastUpdatedAt: null,
    };
    expect(ok(SourceRegistryEntry, entry)).toBe(true);
    expect(ok(SourceRegistryEntry, { ...entry, kind: 'scraped' })).toBe(false);
  });
});

describe('Profile', () => {
  const profile = {
    version: 1,
    taxYear: 2026,
    filingStatus: 'single',
    stateCode: 'CA',
    taxableIncome: 8000000,
    cityMarginalRate: null,
    residency: 'us_citizen',
    age: 34,
    scenario: { principal: 1000000, holdingMonths: 12 },
  };
  it('accepts a full profile', () => {
    expect(ok(Profile, profile)).toBe(true);
  });
  it('rejects extra keys, another version and holdingMonths over 120', () => {
    expect(ok(Profile, { ...profile, email: 'x@example.com' })).toBe(false);
    expect(ok(Profile, { ...profile, version: 2 })).toBe(false);
    expect(ok(Profile, { ...profile, scenario: { principal: 1, holdingMonths: 121 } })).toBe(false);
  });
});

describe('calc output', () => {
  it('accepts a step and an assumption and rejects non-string inputs', () => {
    const step = {
      id: 's1',
      label: 'Gross interest',
      formula: 'P*((1+r)^(m/12)-1)',
      inputs: { P: '100000' },
      result: '4000',
    };
    expect(ok(CalcStep, step)).toBe(true);
    expect(ok(CalcStep, { ...step, inputs: { P: 100000 } })).toBe(false);
    expect(ok(Assumption, { id: 'a1', text: 'NIIT ignored', editable: false })).toBe(true);
  });
});
