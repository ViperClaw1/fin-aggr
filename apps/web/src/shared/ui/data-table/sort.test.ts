import { describe, expect, it } from 'vitest';
import { nextSort, resolveSort, sortRows } from './sort';

describe('nextSort', () => {
  it('cycles none → ascending → descending → none on one column', () => {
    const asc = nextSort(null, 'apy');
    expect(asc).toEqual({ columnId: 'apy', direction: 'asc' });
    const desc = nextSort(asc, 'apy');
    expect(desc).toEqual({ columnId: 'apy', direction: 'desc' });
    expect(nextSort(desc, 'apy')).toBeNull();
  });

  it('starts another column ascending', () => {
    expect(nextSort({ columnId: 'apy', direction: 'desc' }, 'name')).toEqual({
      columnId: 'name',
      direction: 'asc',
    });
  });
});

describe('resolveSort', () => {
  const visible = (id: string): boolean => id !== 'hidden';
  const fallback = { columnId: 'name', direction: 'asc' } as const;

  it('keeps a sort on a visible column', () => {
    const sort = { columnId: 'apy', direction: 'desc' } as const;
    expect(resolveSort(sort, fallback, visible)).toBe(sort);
  });

  it('falls back to the default when the sorted column is hidden', () => {
    expect(resolveSort({ columnId: 'hidden', direction: 'asc' }, fallback, visible)).toBe(fallback);
  });

  it('keeps "not sorted" instead of restoring the default', () => {
    expect(resolveSort(null, fallback, visible)).toBeNull();
  });

  it('lets a default descending sort cycle through "not sorted"', () => {
    const net = { columnId: 'net', direction: 'desc' } as const;
    const off = nextSort(resolveSort(net, net, visible), 'net');
    expect(off).toBeNull();
    const again = nextSort(resolveSort(off, net, visible), 'net');
    expect(again).toEqual({ columnId: 'net', direction: 'asc' });
  });

  it('drops sorting when the default column is hidden too', () => {
    const hiddenDefault = { columnId: 'hidden', direction: 'asc' } as const;
    expect(resolveSort(hiddenDefault, hiddenDefault, visible)).toBeNull();
  });
});

describe('sortRows', () => {
  const rows = [
    { id: 'c', v: 2 },
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
  ];
  const byV = (x: { v: number }, y: { v: number }): number => x.v - y.v;
  const ids = (list: { id: string }[]): string[] => list.map((r) => r.id);

  it('sorts by the comparator in both directions', () => {
    expect(ids(sortRows(rows, byV, 'asc', (r) => r.id))).toEqual(['a', 'b', 'c']);
    expect(ids(sortRows(rows, byV, 'desc', (r) => r.id))).toEqual(['b', 'c', 'a']);
  });

  it('orders equal values by row id, whatever the input order', () => {
    const reversed = [...rows].reverse();
    expect(ids(sortRows(reversed, byV, 'desc', (r) => r.id))).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input', () => {
    sortRows(rows, byV, 'asc', (r) => r.id);
    expect(ids(rows)).toEqual(['c', 'a', 'b']);
  });
});
