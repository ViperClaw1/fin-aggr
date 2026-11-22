import { Decimal } from 'decimal.js';
import { eligible, hasResult, text, type Row } from './offers';

/**
 * Fiscal Data cross-check (ADR-020, owner decision 2026-11-22). Fiscal lags about a month, so
 * today's offers are never in it. The check runs on the history both feeds share: same CUSIP and
 * issue date, published terms only, Fiscal row with a result. The APY inputs must be equal:
 * the high price of a bill, the high yield of a note. No shared pair at all is a mismatch too:
 * one of the two shapes broke.
 */

const PAGE = 250;

export const FISCAL_CHECK_URL = `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query?sort=-auction_date&page[size]=${String(PAGE)}`;

function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new Error('treasury cross-check body is not an array');
  return value.filter((item): item is Row => typeof item === 'object' && item !== null);
}

function same(a: string, b: string): boolean {
  if (a === '' || b === '') return false;
  try {
    return new Decimal(a).eq(b);
  } catch {
    return false;
  }
}

function fiscalIndex(fiscalBody: string): Map<string, Row> {
  const fiscal: unknown = JSON.parse(fiscalBody);
  const data =
    typeof fiscal === 'object' && fiscal !== null && 'data' in fiscal ? fiscal.data : null;
  return new Map(
    rows(data).map((row) => [`${text(row, 'cusip')} ${text(row, 'issue_date')}`, row]),
  );
}

/** Null when Fiscal has no result for this auction, else whether the APY inputs agree. */
function agrees(row: Row, fiscal: Map<string, Row>): boolean | null {
  const match = fiscal.get(`${text(row, 'cusip')} ${text(row, 'issueDate').slice(0, 10)}`);
  if (match === undefined) return null;
  const bill = text(row, 'securityType') === 'Bill';
  const theirs = text(match, bill ? 'high_price' : 'high_yield');
  if (theirs === '' || theirs === 'null') return null;
  return same(text(row, bill ? 'highPrice' : 'highYield'), theirs);
}

/** Mismatched CUSIPs, `no_overlap` when the feeds share nothing, or an empty list. */
export function fiscalMismatches(directBody: string, fiscalBody: string): string[] {
  const fiscal = fiscalIndex(fiscalBody);
  const bad: string[] = [];
  let shared = 0;
  for (const row of rows(JSON.parse(directBody))) {
    if (!eligible(row) || !hasResult(row)) continue;
    const ok = agrees(row, fiscal);
    if (ok === null) continue;
    shared += 1;
    if (!ok) bad.push(text(row, 'cusip'));
  }
  return shared === 0 ? ['no_overlap'] : bad;
}
