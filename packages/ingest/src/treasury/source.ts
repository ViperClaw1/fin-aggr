import type { Source } from '../pipeline';
import { apyOutOfBounds } from '../rate-move';
import type { ValidationReport } from '../validate';
import { fetchAuctionBody } from './auctions';
import { latestOffers, type TreasuryOffer } from './offers';

/** One request: 250 auctions reach back over a year, enough for every 52-week bill. */
const DIRECT_LIST_URL =
  'https://www.treasurydirect.gov/TA_WS/securities/auctioned?format=json&pagesize=250';

/** Bills of 13, 26, 52 weeks and notes of 2, 3, 5, 7, 10 years (ADR-020). */
const PUBLISHED_TERMS = 8;

/**
 * Every term present and every APY inside the product bounds, or nothing is published.
 * ponytail: no move check against the previous version; add `rateMoveExceeds` per term if an
 * official auction result ever needs a human before it is shown.
 */
export function validateTreasuryOffers(
  offers: readonly TreasuryOffer[],
): ValidationReport<TreasuryOffer> {
  if (offers.length !== PUBLISHED_TERMS) return { clean: [], suspicious: [], blocked: 'terms' };
  if (offers.some((offer) => apyOutOfBounds(offer.apy))) {
    return { clean: [], suspicious: [], blocked: 'rate bounds' };
  }
  return { clean: offers, suspicious: [], blocked: null };
}

export function treasuryDirectSource(): Source<string, TreasuryOffer> {
  return {
    id: 'treasurydirect',
    domain: 'treasury',
    kind: 'official_api',
    fetch: (ctx) =>
      fetchAuctionBody({
        fetchImpl: fetch,
        requestSignal: () => ctx.requestSignal(),
        url: DIRECT_LIST_URL,
      }),
    parse: latestOffers,
    validate: (rows) => validateTreasuryOffers(rows),
  };
}
