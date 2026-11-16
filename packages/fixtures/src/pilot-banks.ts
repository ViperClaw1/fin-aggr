// Demo copies of pilot rates for the mock catalog. Not a published bank_products version.
// Real pilot rates come only from the bank_products domain. These rows stay isMock.
import {
  centsFromInteger,
  IsoDate,
  IsoDateTime,
  rateFromPercent,
  type EarlyWithdrawal,
  type DocumentMeta,
  type Institution,
  type Product,
  type Provenance,
  type Rule,
  type SourceRegistryEntry,
} from '@fa/contracts';

const ALLY = 'fdic:57803';
const AMEX = 'fdic:27471';
const SALLIE = 'fdic:58177';

const PERSONAL: Rule = { op: 'and', args: [], label: 'Personal accounts only' };
const UNSTATED: Rule = { op: 'and', args: [], label: 'No eligibility rule on the rates page' };

function provenance(sourceId: string, url: string, asOf: string): Provenance {
  return {
    sourceId,
    sourceUrl: url,
    retrievedAt: IsoDateTime.parse(`${asOf}T00:00:00Z`),
    verification: { status: 'unverified' },
    isMock: true,
  };
}

function publicId(institutionId: string, slug: string): string {
  return `${institutionId.replaceAll(':', '-')}-${slug}`;
}

function product(input: {
  id: string;
  institutionId: string;
  category: 'cd' | 'savings';
  name: string;
  termMonths: number | null;
  apy: string;
  minCents: string;
  compounding: Product['compounding'];
  penalty: EarlyWithdrawal;
  quote: string;
  asOf: string;
  url: string;
  eligibility: Rule;
}): Product {
  const sourceId = `bank:${input.institutionId}`;
  const cited: Provenance = {
    ...provenance(sourceId, input.url, input.asOf),
    document: { id: `${sourceId}:page`, page: 1, quote: input.quote },
  };
  const minOpening = centsFromInteger(input.minCents);
  return {
    id: input.id,
    institutionId: input.institutionId,
    category: input.category,
    name: input.name,
    termMonths: input.termMonths,
    tierMode: 'whole_balance',
    tiers: [{ minBalance: minOpening, maxBalance: null, apy: rateFromPercent(input.apy) }],
    compounding: input.compounding,
    minOpening,
    maxDeposit: null,
    earlyWithdrawal: { value: input.penalty, provenance: cited },
    eligibility: input.eligibility,
    taxTreatment: 'taxable',
    validFrom: IsoDate.parse(input.asOf),
    validTo: null,
    provenance: provenance(sourceId, input.url, input.asOf),
  };
}

const ALLY_URL = 'https://www.ally.com/bank/view-rates/';
const AMEX_URL =
  'https://www.americanexpress.com/en-us/banking/online-savings/high-yield-savings-account/';
const SALLIE_URL = 'https://www.salliemae.com/savings/certificates-of-deposit';

const SALLIE_SHORT =
  'If your CD has a maturity of twelve (12) months or less, the penalty we impose will equal ninety (90) days of simple interest on the amount withdrawn subject to penalty.';
const SALLIE_LONG =
  'If your CD has a maturity greater than twelve (12) months, the penalty we impose will equal one hundred eighty (180) days of simple interest on the amount withdrawn subject to penalty.';

function sallie(term: number, apy: string): Product {
  const short = term <= 12;
  return product({
    id: publicId(SALLIE, `cd-${String(term)}`),
    institutionId: SALLIE,
    category: 'cd',
    name: `${String(term)}-month CD`,
    termMonths: term,
    apy,
    minCents: '250000',
    compounding: 'monthly',
    penalty: { kind: 'days_of_interest', days: short ? 90 : 180 },
    quote: short ? SALLIE_SHORT : SALLIE_LONG,
    asOf: '2026-11-16',
    url: SALLIE_URL,
    eligibility: PERSONAL,
  });
}

export const pilotBankProducts: readonly Product[] = [
  product({
    id: publicId(ALLY, 'savings'),
    institutionId: ALLY,
    category: 'savings',
    name: 'Savings',
    termMonths: null,
    apy: '3.2',
    minCents: '0',
    compounding: 'daily',
    penalty: { kind: 'none' },
    quote: 'Access your money at any time.',
    asOf: '2026-11-12',
    url: ALLY_URL,
    eligibility: UNSTATED,
  }),
  product({
    id: publicId(AMEX, '3200'),
    institutionId: AMEX,
    category: 'savings',
    name: 'High Yield Savings Account',
    termMonths: null,
    apy: '3.2',
    minCents: '0',
    compounding: 'daily',
    penalty: { kind: 'none' },
    quote:
      'They combine the flexibility of regular deposits and withdrawals with the benefit of earning more on your savings.',
    asOf: '2026-11-15',
    url: AMEX_URL,
    eligibility: UNSTATED,
  }),
  sallie(15, '4.65'),
  sallie(60, '5.00'),
  sallie(12, '4.60'),
  sallie(18, '4.65'),
  sallie(36, '4.75'),
];

function bank(id: string, name: string, website: string): Institution {
  return {
    id,
    name,
    regulator: 'FDIC',
    kind: 'direct_bank',
    partnerInstitutionIds: [],
    hqState: 'UT',
    website,
    provenance: {
      sourceId: 'fdic-institutions',
      sourceUrl: 'https://api.fdic.gov/banks/institutions',
      retrievedAt: IsoDateTime.parse('2026-11-13T12:55:01Z'),
      verification: {
        status: 'verified',
        verifiedAt: IsoDate.parse('2026-11-13'),
        by: 'official_api',
      },
      isMock: false,
    },
  };
}

/** Names and certificates from FDIC institutions on 2026-11-13. */
export const pilotInstitutions: readonly Institution[] = [
  bank(ALLY, 'Ally Bank', 'https://www.ally.com'),
  bank(AMEX, 'American Express National Bank', 'https://www.americanexpress.com'),
  bank(SALLIE, 'Sallie Mae Bank', 'https://www.salliemae.com'),
];

export const PILOT_CD_COUNT = pilotBankProducts.filter((row) => row.category === 'cd').length;
export const PILOT_SAVINGS_COUNT = pilotBankProducts.filter(
  (row) => row.category === 'savings',
).length;

const pilotSources: readonly SourceRegistryEntry[] = [
  {
    id: 'fdic-institutions',
    name: 'FDIC BankFind institutions',
    url: 'https://api.fdic.gov/banks/institutions',
    kind: 'official_api',
    license: 'public domain',
    lastUpdatedAt: IsoDateTime.parse('2026-11-13T12:55:01Z'),
  },
  {
    id: 'bank:fdic:57803',
    name: 'Ally Bank rates page',
    url: 'https://www.ally.com/bank/view-rates/',
    kind: 'issuer_document',
    license: 'issuer terms',
    lastUpdatedAt: IsoDateTime.parse('2026-11-12T00:00:00Z'),
  },
  {
    id: 'bank:fdic:27471',
    name: 'American Express National Bank rates',
    url: 'https://www.americanexpress.com/en-us/banking/online-savings/high-yield-savings-account/',
    kind: 'issuer_document',
    license: 'issuer terms',
    lastUpdatedAt: IsoDateTime.parse('2026-11-15T00:00:00Z'),
  },
  {
    id: 'bank:fdic:58177',
    name: 'Sallie Mae Bank CD rates',
    url: 'https://www.salliemae.com/savings/certificates-of-deposit',
    kind: 'issuer_document',
    license: 'issuer terms',
    lastUpdatedAt: IsoDateTime.parse('2026-11-16T00:00:00Z'),
  },
];

const pilotDocuments: readonly DocumentMeta[] = [
  {
    id: 'bank:fdic:57803:page',
    title: 'Ally Bank view rates',
    publisherInstitutionId: ALLY,
    pages: 1,
    fileUrl: 'https://www.ally.com/bank/view-rates/',
    publishedAt: IsoDate.parse('2026-11-12'),
    isSynthetic: false,
  },
  {
    id: 'bank:fdic:27471:page',
    title: 'American Express National Bank savings rates',
    publisherInstitutionId: AMEX,
    pages: 1,
    fileUrl:
      'https://www.americanexpress.com/en-us/banking/online-savings/high-yield-savings-account/',
    publishedAt: IsoDate.parse('2026-11-15'),
    isSynthetic: false,
  },
  {
    id: 'bank:fdic:58177:page',
    title: 'Sallie Mae Bank certificates of deposit',
    publisherInstitutionId: SALLIE,
    pages: 1,
    fileUrl: 'https://www.salliemae.com/savings/certificates-of-deposit',
    publishedAt: IsoDate.parse('2026-11-16'),
    isSynthetic: false,
  },
];

export const pilotBankDomain = {
  asOf: IsoDate.parse('2026-11-16'),
  isMock: true as const,
  products: pilotBankProducts,
  institutions: pilotInstitutions,
  documents: pilotDocuments,
  sources: pilotSources,
};
