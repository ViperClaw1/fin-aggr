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

/**
 * First connection holds every row. After a person confirms the bank,
 * only a stale date, an APY outside 0–15%, or a move over 50bp is held.
 * A count under half the previous rows is `countGate` in the pipeline.
 */
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

export function reviewBankProducts(input: {
  rows: readonly Product[];
  previous: readonly Product[];
  confirmed: boolean;
  retrievedDay: string;
}): ValidationReport<Product> {
  if (!input.confirmed) {
    return {
      clean: [],
      suspicious: input.rows.map((row) => ({ key: row.id, reasons: ['first_connection'] })),
      blocked: null,
    };
  }
  const fresh: Product[] = [];
  const stale: { key: string; reasons: string[] }[] = [];
  for (const row of input.rows) {
    if (rateIsStale(row.validFrom, input.retrievedDay)) {
      stale.push({ key: row.id, reasons: ['stale'] });
    } else fresh.push(row);
  }
  const checked = validateProducts(fresh, input.previous);
  return {
    clean: checked.clean,
    suspicious: [...stale, ...checked.suspicious],
    blocked: checked.blocked,
  };
}
