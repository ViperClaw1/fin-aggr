'use client';

// After-tax ranking for the shown products (spec §5, ADR-008). Data arrives as arguments: the
// products and tax tables from the build, the profile from the browser. Nothing leaves the
// browser (ADR-004). Recomputed only when one of the three changes; profile edits go through
// useDeferredValue, so typing stays responsive while the table catches up.
import type { Product, Profile, TaxTables } from '@fa/contracts';
import { rankProducts, type RankedProduct } from '@fa/engine';
import { useDeferredValue, useMemo } from 'react';

/** The rankProducts order, or null without a complete profile (rank by gross APY then). */
export function useNetYield(
  products: readonly Product[],
  profile: Profile | null,
  tables: TaxTables,
): readonly RankedProduct[] | null {
  const deferred = useDeferredValue(profile);
  return useMemo(
    () => (deferred === null ? null : rankProducts(products, deferred, tables)),
    [products, deferred, tables],
  );
}
