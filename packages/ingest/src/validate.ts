import { Product, type Product as ProductRow } from '@fa/contracts';
import { apyOutOfBounds, rateMoveExceeds } from './rate-move';

interface RowFlag {
  key: string;
  reasons: string[];
}

export interface ValidationReport<T> {
  clean: readonly T[];
  suspicious: readonly RowFlag[];
  blocked: string | null;
}

/** Empty, or fewer than half the previous rows, blocks the whole publish. */
export function countGate(rowCount: number, previousCount: number): string | null {
  if (rowCount === 0) return 'empty';
  if (previousCount > 0 && rowCount * 2 < previousCount) return 'shrunk';
  return null;
}

function rowKey(row: unknown, index: number): string {
  if (typeof row === 'object' && row !== null && 'id' in row && typeof row.id === 'string') {
    return row.id;
  }
  return `row:${String(index)}`;
}

function productReasons(row: ProductRow, previous: ReadonlyMap<string, ProductRow>): string[] {
  const reasons: string[] = [];
  if (row.termMonths !== null && row.termMonths <= 0) reasons.push('term');
  if (row.minOpening < 0) reasons.push('min deposit');
  const prior = previous.get(row.id);
  for (const tier of row.tiers) {
    if (apyOutOfBounds(tier.apy)) reasons.push('apy bounds');
    const priorTier = prior?.tiers.find((item) => item.minBalance === tier.minBalance);
    if (priorTier !== undefined && rateMoveExceeds(tier.apy, priorTier.apy)) {
      reasons.push('apy move');
    }
  }
  return reasons;
}

/** Schema failures and product bounds. Domain-level empty/half checks are `countGate`. */
export function validateProducts(
  rows: readonly unknown[],
  previous: readonly unknown[],
): ValidationReport<ProductRow> {
  const prior = new Map<string, ProductRow>();
  for (const row of previous) {
    const parsed = Product.safeParse(row);
    if (parsed.success) prior.set(parsed.data.id, parsed.data);
  }
  const clean: ProductRow[] = [];
  const suspicious: RowFlag[] = [];
  rows.forEach((row, index) => {
    const parsed = Product.safeParse(row);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'invalid product';
      suspicious.push({ key: rowKey(row, index), reasons: [message] });
      return;
    }
    const reasons = productReasons(parsed.data, prior);
    if (reasons.length > 0) suspicious.push({ key: parsed.data.id, reasons });
    else clean.push(parsed.data);
  });
  return { clean, suspicious, blocked: null };
}
