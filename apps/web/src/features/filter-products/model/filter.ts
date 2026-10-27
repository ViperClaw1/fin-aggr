// Pure filtering: keeps order, never mutates, empty filters return the same items.
import { compareRate, type Id, type Institution, type Product } from '@fa/contracts';
import type { RankedProduct } from '@fa/engine';
import { headlineApy } from '@/entities/product';
import type { ProductFilters } from './search-params';

export type InstitutionIndex = ReadonlyMap<Id, Pick<Institution, 'name' | 'kind'>>;

type Test = (p: Product, issuer: Pick<Institution, 'name' | 'kind'>) => boolean;

function tests(f: Omit<ProductFilters, 'hide'>): Test[] {
  const out: Test[] = [];
  if (f.term.length > 0) out.push((p) => p.termMonths !== null && f.term.includes(p.termMonths));
  if (f.kind.length > 0) out.push((_, issuer) => f.kind.includes(issuer.kind));
  const { minApy, maxOpening } = f;
  if (minApy !== null) out.push((p) => compareRate(headlineApy(p), minApy) >= 0);
  if (maxOpening !== null) out.push((p) => p.minOpening <= maxOpening);
  const needle = f.search.toLowerCase();
  if (needle !== '')
    out.push(
      (p, issuer) =>
        p.name.toLowerCase().includes(needle) || issuer.name.toLowerCase().includes(needle),
    );
  return out;
}

/** A product whose institution is missing from the index is left out. */
export function filterProducts(
  products: readonly Product[],
  filters: Omit<ProductFilters, 'hide'>,
  institutions: InstitutionIndex,
): Product[] {
  const checks = tests(filters);
  return products.filter((p) => {
    const issuer = institutions.get(p.institutionId);
    return issuer !== undefined && checks.every((check) => check(p, issuer));
  });
}

/** `hide: 'ineligible'` drops that group only; needs_profile stays and ranks are kept. */
export const filterRanked = (
  ranked: readonly RankedProduct[],
  hide: ProductFilters['hide'],
): RankedProduct[] => (hide === null ? [...ranked] : ranked.filter((r) => r.group !== hide));
