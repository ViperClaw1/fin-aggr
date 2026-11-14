/**
 * Product fields the auction feeds do not carry.
 * Quotes are copied from the pages read on 2026-11-14. They stay unverified
 * until a person confirms them. They are not a published Product.
 */

const MISSING_PRODUCT_FIELDS = [
  'tier',
  'early_withdrawal',
  'eligibility',
  'tax_treatment',
] as const;

export interface TreasuryProductGap {
  field: (typeof MISSING_PRODUCT_FIELDS)[number];
  productField: 'tiers' | 'earlyWithdrawal' | 'eligibility' | 'taxTreatment';
  citation: string;
  sourceUrl: string;
  quote: string;
  verification: 'unverified';
}

const GAPS: readonly TreasuryProductGap[] = [
  {
    field: 'tier',
    productField: 'tiers',
    citation: '31 CFR 356.12(a)',
    sourceUrl:
      'https://www.ecfr.gov/current/title-31/subtitle-B/chapter-II/subchapter-A/part-356/subpart-B/section-356.12',
    quote:
      'All bids must state the par amount of securities bid for and must equal or exceed the minimum to bid amount stated in the auction announcement. Bids in larger amounts must be in the multiple stated in the auction announcement.',
    verification: 'unverified',
  },
  {
    field: 'early_withdrawal',
    productField: 'earlyWithdrawal',
    citation: 'TreasuryDirect, Selling a Treasury Marketable Security',
    sourceUrl:
      'https://www.treasurydirect.gov/marketable-securities/selling-marketable-securities/',
    quote:
      'You can hold a Treasury marketable security until it matures or sell it before it matures. To sell a Treasury marketable security, you must work through a bank, broker, or dealer. In Treasury Direct, when you buy a Treasury marketable security, you must hold it in your TreasuryDirect account for 45 days before selling or transferring it.',
    verification: 'unverified',
  },
  {
    field: 'eligibility',
    productField: 'eligibility',
    citation: '31 CFR 363.10',
    sourceUrl:
      'https://www.ecfr.gov/current/title-31/subtitle-B/chapter-II/subchapter-B/part-363/subpart-B/section-363.10',
    quote:
      'A TreasuryDirect account is an online account maintained by us solely in your name in which you may hold and conduct transactions in eligible book-entry Treasury securities.',
    verification: 'unverified',
  },
  {
    field: 'tax_treatment',
    productField: 'taxTreatment',
    citation: '31 CFR 356.32(a)',
    sourceUrl:
      'https://www.ecfr.gov/current/title-31/subtitle-B/chapter-II/subchapter-A/part-356/subpart-D/section-356.32',
    quote:
      'Securities issued under this part are subject to all applicable taxes imposed under the Internal Revenue Code of 1986, or its successor. Under section 3124 of title 31, United States Code, the securities are exempt from taxation by a State or political subdivision of a State, except for State estate or inheritance taxes and other exceptions as provided in that section.',
    verification: 'unverified',
  },
];

export function treasuryProductGaps(): readonly TreasuryProductGap[] {
  return GAPS;
}

export function missingFieldsReason(): string {
  return `missing_fields:${MISSING_PRODUCT_FIELDS.join(',')}`;
}

/** Auction rows are not products until a person confirms these quotes. */
export function publishTreasuryProducts(): never {
  throw new Error(
    'treasury products stay unpublished until the product-field quotes are confirmed',
  );
}
