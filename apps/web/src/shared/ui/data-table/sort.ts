// Sorting for DataTable. Comparators come from the caller (Cents as integers, Rate via
// compareRate), so the table never turns a value into a number itself.

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  columnId: string;
  direction: SortDirection;
}

/** A header click cycles: none → ascending → descending → none. Another column starts ascending. */
export function nextSort(current: SortState | null, columnId: string): SortState | null {
  if (current?.columnId !== columnId) return { columnId, direction: 'asc' };
  return current.direction === 'asc' ? { columnId, direction: 'desc' } : null;
}

/**
 * The sort that applies. `null` ("not sorted") stays `null`, so a default sort can be switched
 * off. Only a sort whose column is hidden or not sortable falls back to the default, if that
 * column is available, and otherwise to none.
 */
export function resolveSort(
  requested: SortState | null,
  fallback: SortState | null,
  isSortable: (columnId: string) => boolean,
): SortState | null {
  if (requested === null || isSortable(requested.columnId)) return requested;
  if (fallback !== null && isSortable(fallback.columnId)) return fallback;
  return null;
}

/** A sorted copy. Equal values keep a fixed order by row id, ascending in both directions. */
export function sortRows<T>(
  rows: readonly T[],
  compare: (a: T, b: T) => number,
  direction: SortDirection,
  getRowId: (row: T) => string,
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const byValue = sign * compare(a, b);
    if (byValue !== 0) return byValue;
    const [x, y] = [getRowId(a), getRowId(b)];
    if (x === y) return 0;
    return x < y ? -1 : 1;
  });
}
