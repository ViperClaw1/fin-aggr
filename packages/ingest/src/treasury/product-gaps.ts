/**
 * Product fields the auction feeds do not carry.
 * Quotes are the eCFR versioner text read on 2026-11-16, except the
 * tax quote, unchanged from 2026-11-14, and the early-withdrawal quote, read again on
 * 2026-11-22 to add the 4-week bill sentence (the opening "you can hold" sentence was
 * dropped to stay within 400 characters).
 * They stay unverified until a person confirms them. They are not a published Product.
 * 31 CFR 363.11 is stored whole: clipping it to 400 characters would drop the
 * address sentence or the depository-account sentence. It is not a Provenance quote.
 */

type MissingProductField =
  'tier' | 'min_opening' | 'early_withdrawal' | 'eligibility' | 'tax_treatment';

export interface TreasuryProductGap {
  id: `treasury:${MissingProductField}`;
  field: MissingProductField;
  productField: 'tiers' | 'minOpening' | 'earlyWithdrawal' | 'eligibility' | 'taxTreatment';
  citation: string;
  sourceUrl: string;
  quote: string;
  verification: 'unverified';
}

const GAPS: readonly TreasuryProductGap[] = [
  {
    id: 'treasury:tier',
    field: 'tier',
    productField: 'tiers',
    citation: '31 CFR 356.20(d)(1)',
    sourceUrl:
      'https://www.ecfr.gov/current/title-31/subtitle-B/chapter-II/subchapter-A/part-356/subpart-C/section-356.20',
    quote:
      'Single-price auctions. Both noncompetitive and competitive bidders receive the price equivalent to the high yield, high discount rate, or high discount margin at which bids were awarded. For inflation-protected securities, the price for awarded securities is the price equivalent to the high real yield.',
    verification: 'unverified',
  },
  {
    id: 'treasury:min_opening',
    field: 'min_opening',
    productField: 'minOpening',
    citation: '31 CFR 356.12(a)',
    sourceUrl:
      'https://www.ecfr.gov/current/title-31/subtitle-B/chapter-II/subchapter-A/part-356/subpart-B/section-356.12',
    quote:
      'All bids must state the par amount of securities bid for and must equal or exceed the minimum to bid amount stated in the auction announcement. Bids in larger amounts must be in the multiple stated in the auction announcement.',
    verification: 'unverified',
  },
  {
    id: 'treasury:early_withdrawal',
    field: 'early_withdrawal',
    productField: 'earlyWithdrawal',
    citation: 'TreasuryDirect, Selling a Treasury Marketable Security',
    sourceUrl:
      'https://www.treasurydirect.gov/marketable-securities/selling-marketable-securities/',
    quote:
      'To sell a Treasury marketable security, you must work through a bank, broker, or dealer. In Treasury Direct, when you buy a Treasury marketable security, you must hold it in your TreasuryDirect account for 45 days before selling or transferring it. This means you can’t sell or transfer a 4-week bill from TreasuryDirect because it matures in less than 45 days.',
    verification: 'unverified',
  },
  {
    id: 'treasury:eligibility',
    field: 'eligibility',
    productField: 'eligibility',
    citation: '31 CFR 363.11',
    sourceUrl:
      'https://www.ecfr.gov/current/title-31/subtitle-B/chapter-II/subchapter-B/part-363/subpart-B/section-363.11',
    quote:
      'Only an individual or an entity is eligible to open a TreasuryDirect account. In order to open a TreasuryDirect account, an individual or entity account manager must have a valid social security number (SSN), be 18 years of age or over, and be legally competent. An entity must have a valid SSN or employer identification number. The account owner must have a United States address of record and have an account at a United States depository financial institution that will accept debits and credits using the Automated Clearing House method of payment.',
    verification: 'unverified',
  },
  {
    id: 'treasury:tax_treatment',
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
