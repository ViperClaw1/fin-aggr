// The table's default order, computed here and not by DataTable (it gets ordered rows and
// sort={null}): top APY without a profile, the rankProducts order with one. The ranking is not
// one column's sort (eligible, then needs data, then ineligible, net interest inside each group).
import { compareRate, type Rate } from '@fa/contracts';
import type { RankedProduct } from '@fa/engine';
import { headlineApy } from '@/entities/product';
import type { CompareProduct } from './wire';

export interface Row {
  product: CompareProduct;
  /** null without a complete profile */
  ranked: RankedProduct | null;
}

type WithApy = [product: CompareProduct, apy: Rate];

/** Top APY first; ties by id, code-unit order, the same on every machine. */
function byApy([a, aApy]: WithApy, [b, bApy]: WithApy): number {
  const byRate = compareRate(bApy, aApy);
  if (byRate !== 0 || a.id === b.id) return byRate;
  return a.id < b.id ? -1 : 1;
}

export function defaultOrder(
  products: readonly CompareProduct[],
  ranked: readonly RankedProduct[] | null,
): Row[] {
  // the top APY once per product, not twice per comparison (hydration cost on phones)
  if (ranked === null)
    return products
      .map((p): WithApy => [p, headlineApy(p)])
      .sort(byApy)
      .map(([product]) => ({ product, ranked: null }));
  const byId = new Map(products.map((p) => [p.id, p]));
  return ranked.flatMap((r) => {
    const product = byId.get(r.productId);
    return product === undefined ? [] : [{ product, ranked: r }];
  });
}
