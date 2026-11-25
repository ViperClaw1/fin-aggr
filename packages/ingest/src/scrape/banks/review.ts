import type { Product } from '@fa/contracts';
import type { ValidationReport } from '../../validate';
import { validateProducts } from '../../validate';

const DAY_MS = 86_400_000;
const STALE_AFTER_DAYS = 180;

function midnight(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000Z`);
}

/** A page date more than 180 days before the retrieval day is stale. */
export function rateIsStale(asOf: string, retrievedDay: string): boolean {
  return midnight(retrievedDay) - midnight(asOf) > STALE_AFTER_DAYS * DAY_MS;
}

/** A throw from an adapter is manual mode. The caller publishes nothing. */
export function readBankPage<T>(
  read: () => T,
): { ok: true; value: T } | { ok: false; reason: 'adapter' } {
  try {
    return { ok: true, value: read() };
  } catch {
    return { ok: false, reason: 'adapter' };
  }
}

function offerKey(row: Product): string {
  return [
    row.category,
    row.termMonths,
    row.scope,
    row.marketId,
    row.channel,
    row.relationshipRate,
  ].join('|');
}

/**
 * Ids of termed rows that share one offer slot (category, term, market, channel) with another.
 * Rows without a term are skipped: a bank may sell several savings accounts.
 */
function duplicateIds(rows: readonly Product[]): Set<string> {
  const byKey = new Map<string, string[]>();
  for (const row of rows) {
    if (row.termMonths === null) continue;
    byKey.set(offerKey(row), [...(byKey.get(offerKey(row)) ?? []), row.id]);
  }
  return new Set([...byKey.values()].filter((ids) => ids.length > 1).flat());
}

/**
 * Two rows for one offer slot are held as `duplicate_term`, before any other check.
 * First connection holds every row. After a person confirms the bank, a product
 * id is known when a person confirmed it or it is in the previous published version.
 * Any other id is still first connection.
 * A known row is held for a stale date, an APY outside 0–15%, or a move over 50bp.
 * A count under half the previous rows is `countGate` in the pipeline.
 */
export function reviewBankProducts(input: {
  rows: readonly Product[];
  previous: readonly Product[];
  confirmed: boolean;
  confirmedIds: readonly string[];
  retrievedDay: string;
}): ValidationReport<Product> {
  if (!input.confirmed) {
    return {
      clean: [],
      suspicious: input.rows.map((row) => ({ key: row.id, reasons: ['first_connection'] })),
      blocked: null,
    };
  }
  const knownIds = new Set([...input.confirmedIds, ...input.previous.map((row) => row.id)]);
  const duplicates = duplicateIds(input.rows);
  const fresh: Product[] = [];
  const held: { key: string; reasons: string[] }[] = [];
  for (const row of input.rows) {
    if (duplicates.has(row.id)) {
      held.push({ key: row.id, reasons: ['duplicate_term'] });
    } else if (!knownIds.has(row.id)) {
      held.push({ key: row.id, reasons: ['first_connection'] });
    } else if (rateIsStale(row.validFrom, input.retrievedDay)) {
      held.push({ key: row.id, reasons: ['stale'] });
    } else fresh.push(row);
  }
  const checked = validateProducts(fresh, input.previous);
  return {
    clean: checked.clean,
    suspicious: [...held, ...checked.suspicious],
    blocked: checked.blocked,
  };
}
