// 120 products: 60 CD, 40 savings, 20 treasury. Variants are assigned round-robin so every
// penalty kind, compounding, tier mode and rule shape appears several times (E2 edge cases).
import {
  parseCents,
  type EarlyWithdrawal,
  type Institution,
  type Product,
  type RateTier,
  type Rule,
} from '@fa/contracts';
import {
  AS_OF,
  PENALTY_PAGE,
  VALID_FROM,
  bps,
  daysBefore,
  dollars,
  mockProvenance,
  type DocumentRef,
} from './common';
import { cycle, type Rng } from './prng';

const COUNTS = { cd: 60, savings: 40, treasury: 20 } as const;
const TIER_BOUNDS_DOLLARS = [0, 10000, 100000] as const;

const CD_TERMS = [3, 6, 9, 12, 18, 24, 36, 60] as const;
const TREASURY_TERMS = [1, 2, 3, 6, 12, 24] as const;
const CD_COMPOUNDING = [
  'daily',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'at_maturity',
] as const;
const CD_PENALTIES: readonly EarlyWithdrawal[] = [
  { kind: 'days_of_interest', days: 90 },
  { kind: 'months_of_interest', months: 6 },
  { kind: 'percent_of_principal', rate: bps(100) },
  { kind: 'none' },
  { kind: 'days_of_interest', days: 180 },
  { kind: 'months_of_interest', months: 12 },
];

const leaf = (field: 'residency' | 'stateOfResidence', value: string): Rule => ({
  op: 'eq',
  field,
  value,
});
const US_PERSON: Rule = {
  op: 'in',
  field: 'residency',
  values: ['us_citizen', 'us_resident'],
  label: 'US citizens and residents',
};
const ADULT: Rule = { op: 'gte', field: 'age', value: 18, label: 'Age 18 or older' };
const RULES: readonly Rule[] = [
  { op: 'and', args: [] },
  US_PERSON,
  ADULT,
  { op: 'and', args: [US_PERSON, ADULT] },
  {
    op: 'or',
    label: 'Residents of CA or TX',
    args: [leaf('stateOfResidence', 'CA'), leaf('stateOfResidence', 'TX')],
  },
  { op: 'not', label: 'Not available in NY', arg: leaf('stateOfResidence', 'NY') },
  { op: 'neq', field: 'residency', value: 'nonresident', label: 'Not for nonresidents' },
  {
    op: 'and',
    label: 'Deposit between $1,000 and $1,000,000',
    args: [
      { op: 'gte', field: 'depositAmount', value: dollars(1000) },
      { op: 'lte', field: 'depositAmount', value: dollars(1000000) },
    ],
  },
  {
    op: 'and',
    args: [
      { op: 'or', args: [{ op: 'not', arg: leaf('stateOfResidence', 'NY') }, US_PERSON] },
      ADULT,
    ],
  },
];

export function penaltyQuote(penalty: EarlyWithdrawal): string {
  switch (penalty.kind) {
    case 'none':
      return 'No penalty applies to withdrawals.';
    case 'days_of_interest':
      return `Early withdrawal penalty: ${String(penalty.days)} days of simple interest on the amount withdrawn.`;
    case 'months_of_interest':
      return `Early withdrawal penalty: ${String(penalty.months)} months of interest on the amount withdrawn.`;
    case 'percent_of_principal':
      return 'Early withdrawal penalty: 1% of the principal withdrawn.';
  }
}

function tiers(count: number, baseBps: number): RateTier[] {
  return Array.from({ length: count }, (_, i) => {
    const next = TIER_BOUNDS_DOLLARS[i + 1];
    const last = i === count - 1 || next === undefined;
    return {
      minBalance: dollars(TIER_BOUNDS_DOLLARS[i] ?? 0),
      maxBalance: last ? null : parseCents(`${String(next - 1)}.99`),
      apy: bps(baseBps + i * 10),
    };
  });
}

interface Draft {
  id: string;
  issuer: Institution;
  name: string;
  termMonths: number | null;
  penalty: EarlyWithdrawal;
  extra: Pick<Product, 'category' | 'tierMode' | 'tiers' | 'compounding' | 'taxTreatment'>;
}

/** Days before AS_OF a fact was retrieved, per kind, so the demo has fresh and stale facts (ADR-016 D6). */
const RETRIEVED_DAYS_BACK = { apy: [0, 14], terms: [0, 150] } as const;

function finish(rng: Rng, d: Draft, i: number, input: ProductInputs): Product {
  const { documents: docs, retrieval } = input;
  const docId = docs.get(d.issuer.id);
  const citation: DocumentRef | undefined =
    docId === undefined
      ? undefined
      : { id: docId, page: PENALTY_PAGE, quote: penaltyQuote(d.penalty) };
  return {
    id: d.id,
    institutionId: d.issuer.id,
    name: d.name,
    termMonths: d.termMonths,
    ...d.extra,
    minOpening: dollars(rng.pick([0, 500, 1000, 5000])),
    maxDeposit: rng.chance(20) ? dollars(1000000) : null,
    earlyWithdrawal: {
      value: d.penalty,
      provenance: mockProvenance(
        'mock-issuer-documents',
        citation,
        daysBefore(AS_OF, retrieval.int(...RETRIEVED_DAYS_BACK.terms)),
      ),
    },
    eligibility: cycle(RULES, i + rng.int(0, RULES.length - 1)),
    validFrom: VALID_FROM,
    validTo: null,
    // the product's own provenance stands for its APY tiers
    provenance: mockProvenance(
      'mock-issuer-rates',
      undefined,
      daysBefore(AS_OF, retrieval.int(...RETRIEVED_DAYS_BACK.apy)),
    ),
  };
}

const pad = (i: number): string => String(i + 1).padStart(4, '0');

export interface ProductInputs {
  depositIssuers: readonly Institution[];
  treasuryIssuers: readonly Institution[];
  /** institutionId → id of the synthetic document that issuer published */
  documents: ReadonlyMap<string, string>;
  /** a stream of its own, so retrieval dates do not shift any other generated value */
  retrieval: Rng;
}

export function generateProducts(rng: Rng, input: ProductInputs): Product[] {
  const { depositIssuers, treasuryIssuers } = input;
  const cds = Array.from({ length: COUNTS.cd }, (_, i): Draft => {
    const termMonths = cycle(CD_TERMS, i);
    return {
      id: `prod_cd_${pad(i)}`,
      issuer: cycle(depositIssuers, i),
      name: `${String(termMonths)}-Month CD`,
      termMonths,
      penalty: cycle(CD_PENALTIES, i),
      extra: {
        category: 'cd',
        tierMode: i % 5 === 4 ? 'marginal' : 'whole_balance',
        tiers: tiers(rng.int(1, 2), rng.int(300, 520)),
        compounding: cycle(CD_COMPOUNDING, i),
        // synthetic: two federal_exempt CDs so the engine's federal exemption runs on fixtures
        taxTreatment: i % 30 === 29 ? 'federal_exempt' : 'taxable',
      },
    };
  });
  const savings = Array.from({ length: COUNTS.savings }, (_, i): Draft => ({
    id: `prod_savings_${pad(i)}`,
    issuer: cycle(depositIssuers, i + 7),
    name: i % 2 === 0 ? 'High-Yield Savings' : 'Tiered Savings',
    termMonths: null,
    penalty: { kind: 'none' },
    extra: {
      category: 'savings',
      tierMode: i % 2 === 0 ? 'whole_balance' : 'marginal',
      tiers: tiers(i % 2 === 0 ? 1 : 3, rng.int(250, 480)),
      compounding: cycle(['daily', 'monthly'] as const, i),
      taxTreatment: 'taxable',
    },
  }));
  const treasuries = Array.from({ length: COUNTS.treasury }, (_, i): Draft => {
    const termMonths = cycle(TREASURY_TERMS, i);
    return {
      id: `prod_treasury_${pad(i)}`,
      issuer: cycle(treasuryIssuers, i),
      name:
        termMonths <= 12
          ? `${String(termMonths)}-Month Treasury Bill`
          : `${String(termMonths)}-Month Treasury Note`,
      termMonths,
      penalty: { kind: 'none' },
      extra: {
        category: 'treasury',
        tierMode: 'whole_balance',
        tiers: tiers(1, rng.int(380, 460)),
        compounding: termMonths <= 12 ? 'at_maturity' : 'semiannual',
        taxTreatment: 'state_local_exempt',
      },
    };
  });
  return [...cds, ...savings, ...treasuries].map((d, i) => finish(rng, d, i, input));
}
