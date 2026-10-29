// The table's default order, computed here and not by DataTable (it gets ordered rows and
// sort={null}): top APY without a profile, the rankProducts order with one. The ranking is not
// one column's sort (eligible, then needs data, then ineligible, net interest inside each group).
import { compareRate, type Product } from '@fa/contracts';
import type { RankedProduct } from '@fa/engine';
import { headlineApy } from '@/entities/product';

export interface Row {
  product: Product;
  /** null without a complete profile */
  ranked: RankedProduct | null;
}

/** Top APY first; ties by id, code-unit order, the same on every machine. */
function byApy(a: Product, b: Product): number {
  const byRate = compareRate(headlineApy(b), headlineApy(a));
  if (byRate !== 0 || a.id === b.id) return byRate;
  return a.id < b.id ? -1 : 1;
}

export function defaultOrder(
  products: readonly Product[],
  ranked: readonly RankedProduct[] | null,
): Row[] {
  if (ranked === null)
    return [...products].sort(byApy).map((product) => ({ product, ranked: null }));
  const byId = new Map(products.map((p) => [p.id, p]));
  return ranked.flatMap((r) => {
    const product = byId.get(r.productId);
    return product === undefined ? [] : [{ product, ranked: r }];
  });
}
