import type { Source } from '../pipeline';
import { sha256Hex } from '../pipeline';
import { apyOutOfBounds } from '../rate-move';
import type { ValidationReport } from '../validate';
import { fetchAuctionBody } from './auctions';
import { FISCAL_CHECK_URL, fiscalMismatches } from './fiscal-check';
import { latestOffers, type TreasuryOffer } from './offers';

/** One request: 250 auctions reach back over a year, enough for every 52-week bill. */
const DIRECT_LIST_URL =
  'https://www.treasurydirect.gov/TA_WS/securities/auctioned?format=json&pagesize=250';

/** Bills of 13, 26, 52 weeks and notes of 2, 3, 5, 7, 10 years (ADR-020). */
const PUBLISHED_TERMS = 8;

/** The stored snapshot holds both bodies, so a review sees what the cross-check saw. */
interface TreasuryBodies {
  direct: string;
  fiscal: string;
}

/**
 * Every term present, every APY inside the product bounds, and Fiscal Data agreeing on the shared
 * history, or nothing is published.
 * ponytail: no move check against the previous version; add `rateMoveExceeds` per term if an
 * official auction result ever needs a human before it is shown.
 */
export function validateTreasuryOffers(
  offers: readonly TreasuryOffer[],
  mismatches: readonly string[] = [],
): ValidationReport<TreasuryOffer> {
  if (offers.length !== PUBLISHED_TERMS) return { clean: [], suspicious: [], blocked: 'terms' };
  if (offers.some((offer) => apyOutOfBounds(offer.apy))) {
    return { clean: [], suspicious: [], blocked: 'rate bounds' };
  }
  if (mismatches.length > 0) {
    return { clean: [], suspicious: [], blocked: `fiscal_mismatch:${mismatches.join(',')}` };
  }
  return { clean: offers, suspicious: [], blocked: null };
}

export function treasuryDirectSource(): Source<TreasuryBodies, TreasuryOffer> {
  // parse sees both bodies, validate sees only rows: the cross-check result passes between them
  let mismatches: string[] = [];
  return {
    id: 'treasurydirect',
    domain: 'treasury',
    kind: 'official_api',
    fetch: async (ctx) => {
      const fetchOne = (url: string) =>
        fetchAuctionBody({ fetchImpl: fetch, requestSignal: () => ctx.requestSignal(), url });
      const direct = await fetchOne(DIRECT_LIST_URL);
      const fiscal = await fetchOne(FISCAL_CHECK_URL);
      const body = { direct: direct.body, fiscal: fiscal.body };
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      return { sha256: sha256Hex(bytes), bytes, body, requestCount: 2 };
    },
    parse: (body) => {
      mismatches = fiscalMismatches(body.direct, body.fiscal);
      return latestOffers(body.direct);
    },
    validate: (rows) => validateTreasuryOffers(rows, mismatches),
  };
}
