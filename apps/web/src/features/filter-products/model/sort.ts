// The compare table's sort as URL state, ?sort=<key>.<asc|desc> (E5 decision 3). The feature owns
// the keys; table columns use SortKey as their id, so a column the feature does not know cannot
// be sorted by the URL. Written with 'replace' like the filters.
import { createParser, useQueryState } from 'nuqs';

const SORT_KEYS = ['bank', 'term', 'apy', 'minOpening', 'netInterest', 'netYield'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export interface ProductSort {
  columnId: SortKey;
  direction: 'asc' | 'desc';
}

export const PRODUCT_SORT_KEY = 'sort';

const isKey = (s: string): s is SortKey => (SORT_KEYS as readonly string[]).includes(s);

export const sortParser = createParser<ProductSort>({
  parse: (value) => {
    const [columnId = '', direction, ...rest] = value.split('.');
    if (rest.length > 0 || !isKey(columnId)) return null;
    return direction === 'asc' || direction === 'desc' ? { columnId, direction } : null;
  },
  serialize: (s) => `${s.columnId}.${s.direction}`,
  eq: (a, b) => a.columnId === b.columnId && a.direction === b.direction,
});

/**
 * The column sort that applies now, or null for the default order. The default order is not a
 * column sort (top APY without a profile, the rankProducts order with one), so the widget computes
 * it and gives DataTable ordered rows with sort={null}; a header click cycle none → asc → desc →
 * none therefore returns to it instead of sticking. A sort on a column that is not shown (e.g.
 * `netYield` while the profile is incomplete) is also null; the URL is left as it is, so the
 * link's sort works once the column appears.
 */
export function effectiveSort(
  requested: ProductSort | null,
  shown: readonly SortKey[],
): ProductSort | null {
  return requested !== null && shown.includes(requested.columnId) ? requested : null;
}

/** The URL sort; nuqs writes with 'replace'. The component sits inside <Suspense>. */
export const useProductSort = () => useQueryState(PRODUCT_SORT_KEY, sortParser);
