import { CodedError } from '../fetch-budget';

/** Code `unconfirmed` reaches the run line; the message names the missing facts. */
class UnconfirmedError extends CodedError {
  constructor(missing: readonly string[]) {
    super('unconfirmed');
    this.message = `treasury facts not confirmed: ${missing.join(',')}`;
  }
}

import { Product, type IsoDate, type IsoDateTime, type Provenance, type Rule } from '@fa/contracts';
import { DIRECT_URL } from './auctions';
import type { TreasuryOffer } from './offers';
import { treasuryProductGaps, type TreasuryProductGap } from './product-gaps';

/**
 * A TreasuryDirect offer as a published `Product` (ADR-020, Treasury products). Every field the
 * auction feed lacks comes from a quote a person confirmed with `ingest:confirm`; without all
 * five confirmations nothing is built.
 */

const TREASURY_ISSUER_ID = 'ust';
const TREASURY_HOLD_DAYS = 45;

export interface Confirmation {
  login: string;
  verifiedAt: IsoDate;
}

const LABEL: Record<TreasuryOffer['securityType'], string> = {
  Bill: 'Treasury Bill',
  Note: 'Treasury Note',
};

/**
 * 31 CFR 363.11: 18 or over, an SSN, a U.S. address of record and a U.S. bank account.
 * The profile has no SSN or address field: residency stands for them (owner to confirm).
 */
const ELIGIBILITY: Rule = {
  op: 'and',
  label: 'TreasuryDirect account holders (31 CFR 363.11)',
  args: [
    { op: 'gte', field: 'age', value: 18, label: 'Age 18 or older' },
    {
      op: 'in',
      field: 'residency',
      values: ['us_citizen', 'us_resident'],
      label: 'SSN, U.S. address of record and U.S. bank account',
    },
  ],
};

function confirmed(
  confirmations: ReadonlyMap<string, Confirmation>,
): Map<TreasuryProductGap['field'], { gap: TreasuryProductGap; confirmation: Confirmation }> {
  const out = new Map<
    TreasuryProductGap['field'],
    { gap: TreasuryProductGap; confirmation: Confirmation }
  >();
  const missing: string[] = [];
  for (const gap of treasuryProductGaps()) {
    const confirmation = confirmations.get(gap.id);
    if (confirmation === undefined) missing.push(gap.id);
    else out.set(gap.field, { gap, confirmation });
  }
  if (missing.length > 0) throw new UnconfirmedError(missing);
  return out;
}

function auctionProvenance(retrievedAt: IsoDateTime, asOf: IsoDate): Provenance {
  return {
    sourceId: 'treasurydirect',
    sourceUrl: DIRECT_URL,
    retrievedAt,
    verification: { status: 'verified', verifiedAt: asOf, by: 'official_api' },
    isMock: false,
  };
}

function quoteProvenance(
  entry: { gap: TreasuryProductGap; confirmation: Confirmation },
  retrievedAt: IsoDateTime,
): Provenance {
  return {
    sourceId: 'treasurydirect',
    sourceUrl: entry.gap.sourceUrl,
    retrievedAt,
    verification: { status: 'verified', verifiedAt: entry.confirmation.verifiedAt, by: 'human' },
    isMock: false,
  };
}

function productId(offer: TreasuryOffer): string {
  const term = offer.securityTerm.toLowerCase().replace('-week', 'w').replace('-year', 'y');
  return `${TREASURY_ISSUER_ID}:${offer.securityType.toLowerCase()}-${term}`;
}

/** `retrievedAt` is the snapshot time; `asOf` its UTC date. */
export function treasuryProducts(
  offers: readonly TreasuryOffer[],
  confirmations: ReadonlyMap<string, Confirmation>,
  retrievedAt: IsoDateTime,
  asOf: IsoDate,
): Product[] {
  const facts = confirmed(confirmations);
  const early = facts.get('early_withdrawal');
  if (early === undefined) throw new UnconfirmedError(['treasury:early_withdrawal']);
  return offers.map((offer) =>
    Product.parse({
      id: productId(offer),
      institutionId: TREASURY_ISSUER_ID,
      category: 'treasury',
      name: `${offer.securityTerm} ${LABEL[offer.securityType]}`,
      termMonths: offer.termMonths,
      tierMode: 'whole_balance',
      tiers: [{ minBalance: offer.minOpening, maxBalance: null, apy: offer.apy }],
      compounding: offer.compounding,
      minOpening: offer.minOpening,
      maxDeposit: offer.maxDeposit,
      earlyWithdrawal: {
        value: { kind: 'market_sale', holdDays: TREASURY_HOLD_DAYS },
        provenance: quoteProvenance(early, retrievedAt),
      },
      eligibility: ELIGIBILITY,
      taxTreatment: 'state_local_exempt',
      validFrom: offer.issueDate,
      validTo: null,
      scope: 'national',
      marketId: null,
      channel: 'online',
      relationshipRate: false,
      provenance: auctionProvenance(retrievedAt, asOf),
    }),
  );
}
