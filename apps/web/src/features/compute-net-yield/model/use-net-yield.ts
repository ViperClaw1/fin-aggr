'use client';

// After-tax ranking for the shown products (spec §5, ADR-008). Data arrives as arguments: the
// products and tax tables from the build, the profile from the browser. Nothing leaves the
// browser (ADR-004). Recomputed only when one of the three changes; profile edits go through
// useDeferredValue, so typing stays responsive while the table catches up.
// The engine (with decimal.js) loads through import() once there is a profile: a visitor without
// one never parses it, which keeps the first load light on phones (Lighthouse TBT, E5 step 2).
import type { Product, Profile, TaxTables } from '@fa/contracts';
import type { RankedProduct, rankProducts } from '@fa/engine';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { lazyOnce } from '@/shared/lib/lazy-once';

type Rank = typeof rankProducts;

const loadRank = lazyOnce(() => import('@fa/engine').then((m) => m.rankProducts));

/** The rankProducts order, or null without a complete profile or until the engine has loaded. */
export function useNetYield(
  products: readonly Product[],
  profile: Profile | null,
  tables: TaxTables,
): readonly RankedProduct[] | null {
  const deferred = useDeferredValue(profile);
  const [rank, setRank] = useState<Rank | null>(null);
  useEffect(() => {
    if (deferred === null || rank !== null) return;
    // a failed chunk load leaves the gross APY order; the next profile change tries again
    loadRank().then(
      (fn) => {
        setRank(() => fn);
      },
      () => undefined,
    );
  }, [deferred, rank]);
  return useMemo(
    () => (deferred === null || rank === null ? null : rank(products, deferred, tables)),
    [products, deferred, tables, rank],
  );
}
