import {
  centsFromInteger,
  IsoDate,
  IsoDateTime,
  Product,
  rateFromPercent,
  type EarlyWithdrawal,
  type Product as ProductRow,
  type Provenance,
  type Rule,
} from '@fa/contracts';
import type { AmexOffer } from '../../banks/amex';
import type { HtmlOffer } from './offer';

export interface BankExtract {
  products: readonly ProductRow[];
  extra: readonly { key: string; reasons: string[] }[];
}

/** The rates page does not state who may open the account. A person confirms this on first connect. */
export const UNSTATED_ELIGIBILITY: Rule = {
  op: 'and',
  args: [],
  label: 'No eligibility rule on the rates page',
};

/**
 * Savings-page facts for American Express type 3200.
 * The rates JSON has no minimum, compounding, or penalty. These lines were typed from the
 * public savings page on 2026-11-15.
 */
export const AMEX_SAVINGS_PAGE = {
  bankType: '3200',
  name: 'High Yield Savings Account',
  url: 'https://www.americanexpress.com/en-us/banking/online-savings/high-yield-savings-account/',
  minDollars: '0',
  compounding: 'daily' as const,
  quote:
    'They combine the flexibility of regular deposits and withdrawals with the benefit of earning more on your savings.',
};

/**
 * CD-page facts for American Express, typed once from the public CD page on 2026-11-16.
 * The rates JSON has the APY and the term. It does not have a penalty. Each quote is the
 * sentence on that page. The day count is the number inside that sentence.
 */
const AMEX_CD_PAGE = {
  url: 'https://www.americanexpress.com/en-us/banking/online-savings/cd-account/',
  minQuote:
    'There is no minimum balance required to open your Account, to avoid being charged a fee, or obtain the Annual Percentage Yield (APY) disclosed to you.',
  compoundQuote: 'Interest on CDs compound daily and post to the account monthly.',
  penalties: [
    'For a CD with a Term of Less than 12 Months: If you withdraw all of your principal balance or if the account is closed for any other reason before maturity, the penalty is 90 days’ interest on the withdrawn amount applying the interest rate disclosed in your account-opening documents.',
    'For a CD with a Term of at least 12 Months but Less than 48 Months: If you withdraw all of your principal balance or if the account is closed for any other reason before maturity, the penalty is 270 days’ interest on the withdrawn amount applying the interest rate disclosed in your account-opening documents.',
    'For a CD with a Term of at least 48 Months but Less than 60 Months: If you withdraw all of your principal balance or if the account is closed for any other reason before maturity, the penalty is 365 days’ interest on the withdrawn amount applying the interest rate disclosed in your account-opening documents.',
    'For a CD with a Term of 60 Months or more: If you withdraw all of your principal balance or if the account is closed for any other reason before maturity, the penalty is 540 days’ interest on the withdrawn amount applying the interest rate disclosed in your account-opening documents.',
  ],
};

const PENALTY_DAYS = /penalty is (\d+) days/;
const PENALTY_SPAN = /at least (\d+) Months but Less than (\d+) Months/;
const PENALTY_OPEN = /(\d+) Months or more/;
const PENALTY_LESS = /Less than (\d+) Months/;

function digits(raw: string): number {
  let value = 0;
  for (const ch of raw) value = value * 10 + (ch.charCodeAt(0) - 48);
  return value;
}

interface PenaltyBand {
  quote: string;
  days: number;
  low: number;
  high: number | null;
}

function bandFrom(quote: string): PenaltyBand | null {
  const days = PENALTY_DAYS.exec(quote);
  if (days === null) return null;
  const count = digits(days[1] ?? '');
  const span = PENALTY_SPAN.exec(quote);
  if (span !== null) {
    return { quote, days: count, low: digits(span[1] ?? ''), high: digits(span[2] ?? '') };
  }
  const open = PENALTY_OPEN.exec(quote);
  if (open !== null) return { quote, days: count, low: digits(open[1] ?? ''), high: null };
  const less = PENALTY_LESS.exec(quote);
  if (less === null) return null;
  return { quote, days: count, low: 0, high: digits(less[1] ?? '') };
}

function covers(band: PenaltyBand, termMonths: number): boolean {
  return termMonths >= band.low && (band.high === null || termMonths < band.high);
}

/** The band whose quote names this term. No quote, no day count. */
function amexCdPenalty(termMonths: number): { days: number; quote: string } | null {
  for (const quote of AMEX_CD_PAGE.penalties) {
    const band = bandFrom(quote);
    if (band !== null && covers(band, termMonths)) return { days: band.days, quote: band.quote };
  }
  return null;
}

/** The CD-page sentences the weekly watch hashes. A wording change is a review, not a new penalty. */
export function amexCdSentences(): readonly string[] {
  return [AMEX_CD_PAGE.minQuote, AMEX_CD_PAGE.compoundQuote, ...AMEX_CD_PAGE.penalties];
}

function centsFromDollarDigits(dollars: string): ReturnType<typeof centsFromInteger> {
  if (!/^\d+$/.test(dollars)) throw new Error('min deposit is not a dollar amount');
  return centsFromInteger(`${dollars}00`);
}

function penaltyOf(days: number | null): EarlyWithdrawal {
  if (days === null) return { kind: 'none' };
  return { kind: 'days_of_interest', days };
}

function cited(sourceId: string, url: string, asOf: string, quote: string): Provenance {
  return {
    sourceId,
    sourceUrl: url,
    retrievedAt: IsoDateTime.parse(`${asOf}T00:00:00.000Z`),
    document: { id: `${sourceId}:page`, page: 1, quote },
    verification: { status: 'unverified' },
    isMock: false,
  };
}

function pageProvenance(sourceId: string, url: string, asOf: string): Provenance {
  return {
    sourceId,
    sourceUrl: url,
    retrievedAt: IsoDateTime.parse(`${asOf}T00:00:00.000Z`),
    verification: { status: 'unverified' },
    isMock: false,
  };
}

/** Dollar digits and a percent string become cents and a rate. No float. */
export function htmlOfferToProduct(input: {
  offer: HtmlOffer;
  institutionId: string;
  url: string;
  eligibility: Rule;
}): ProductRow {
  const sourceId = `bank:${input.institutionId}`;
  const minOpening = centsFromDollarDigits(input.offer.minDollars);
  const slug =
    input.offer.category === 'savings' ? 'savings' : `cd-${String(input.offer.termMonths ?? 0)}`;
  // A colon is not a legal Windows path segment, and the product id is a static route.
  const id = `${input.institutionId.replaceAll(':', '-')}-${slug}`;
  return Product.parse({
    id,
    institutionId: input.institutionId,
    category: input.offer.category,
    name: input.offer.name,
    termMonths: input.offer.termMonths,
    tierMode: 'whole_balance',
    tiers: [
      { minBalance: minOpening, maxBalance: null, apy: rateFromPercent(input.offer.apyPercent) },
    ],
    compounding: input.offer.compounding,
    minOpening,
    maxDeposit: null,
    earlyWithdrawal: {
      value: penaltyOf(input.offer.penaltyDays),
      provenance: cited(sourceId, input.url, input.offer.asOf, input.offer.quote),
    },
    eligibility: input.eligibility,
    taxTreatment: 'taxable',
    validFrom: IsoDate.parse(input.offer.asOf),
    validTo: null,
    provenance: pageProvenance(sourceId, input.url, input.offer.asOf),
  });
}

/** Type 3200 only. The APY is the JSON rate. The rest is `AMEX_SAVINGS_PAGE`. */
export function amexSavingsProduct(offer: AmexOffer): ProductRow {
  if (offer.bankType !== AMEX_SAVINGS_PAGE.bankType) {
    throw new Error('only the savings row has page facts');
  }
  const sourceId = `bank:${offer.institutionId}`;
  const minOpening = centsFromDollarDigits(AMEX_SAVINGS_PAGE.minDollars);
  return Product.parse({
    id: offer.productId.replaceAll(':', '-'),
    institutionId: offer.institutionId,
    category: 'savings',
    name: AMEX_SAVINGS_PAGE.name,
    termMonths: null,
    tierMode: 'whole_balance',
    tiers: [{ minBalance: minOpening, maxBalance: null, apy: offer.apy }],
    compounding: AMEX_SAVINGS_PAGE.compounding,
    minOpening,
    maxDeposit: null,
    earlyWithdrawal: {
      value: { kind: 'none' },
      provenance: cited(sourceId, AMEX_SAVINGS_PAGE.url, offer.asOf, AMEX_SAVINGS_PAGE.quote),
    },
    eligibility: UNSTATED_ELIGIBILITY,
    taxTreatment: 'taxable',
    validFrom: IsoDate.parse(offer.asOf),
    validTo: null,
    provenance: pageProvenance(sourceId, AMEX_SAVINGS_PAGE.url, offer.asOf),
  });
}

/** A CD whose term the page quotes a penalty for. The APY stays the JSON rate. */
export function amexCdProduct(offer: AmexOffer): ProductRow | null {
  if (offer.category !== 'cd' || offer.termMonths === null) return null;
  if (!/no minimum balance required to open/i.test(AMEX_CD_PAGE.minQuote)) return null;
  if (!/compound daily/i.test(AMEX_CD_PAGE.compoundQuote)) return null;
  const penalty = amexCdPenalty(offer.termMonths);
  if (penalty === null) return null;
  const sourceId = `bank:${offer.institutionId}`;
  const minOpening = centsFromDollarDigits('0');
  return Product.parse({
    id: offer.productId.replaceAll(':', '-'),
    institutionId: offer.institutionId,
    category: 'cd',
    name: offer.description,
    termMonths: offer.termMonths,
    tierMode: 'whole_balance',
    tiers: [{ minBalance: minOpening, maxBalance: null, apy: offer.apy }],
    compounding: 'daily',
    minOpening,
    maxDeposit: null,
    earlyWithdrawal: {
      value: { kind: 'days_of_interest', days: penalty.days },
      provenance: cited(sourceId, AMEX_CD_PAGE.url, offer.asOf, penalty.quote),
    },
    eligibility: UNSTATED_ELIGIBILITY,
    taxTreatment: 'taxable',
    validFrom: IsoDate.parse(offer.asOf),
    validTo: null,
    provenance: pageProvenance(sourceId, AMEX_CD_PAGE.url, offer.asOf),
  });
}

/** A confirmed bank publishes rows a person has accepted. */
export function verifiedByHuman(product: ProductRow, verifiedAt: string): ProductRow {
  const verification = {
    status: 'verified' as const,
    verifiedAt: IsoDate.parse(verifiedAt),
    by: 'human' as const,
  };
  return Product.parse({
    ...product,
    provenance: { ...product.provenance, verification },
    earlyWithdrawal: {
      ...product.earlyWithdrawal,
      provenance: { ...product.earlyWithdrawal.provenance, verification },
    },
  });
}
