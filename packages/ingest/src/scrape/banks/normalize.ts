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

/** Hand-typed from the Sallie Mae CD page: the rate applies to personal accounts only. */
export const PERSONAL_ELIGIBILITY: Rule = {
  op: 'and',
  args: [],
  label: 'Personal accounts only',
};

/**
 * Savings-page facts for American Express type 3200.
 * The rates JSON has no minimum, compounding, or penalty. These lines were typed from the
 * public savings page on 2026-11-15. CD rows stay out until a disclosure states a penalty.
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
