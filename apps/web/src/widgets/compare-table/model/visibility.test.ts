import { describe, expect, it } from 'vitest';
import { hiddenProductIds } from './visibility';

const rows = [
  { id: 'a', group: 'eligible' },
  { id: 'b', group: 'ineligible' },
  { id: 'c', group: null },
];

describe('hiddenProductIds', () => {
  it('hides products the filter did not match and keeps the rest', () => {
    expect(hiddenProductIds(rows, new Set(['a', 'b']), null)).toEqual(new Set(['c']));
  });

  it('hides the ineligible group only when that filter is on', () => {
    const matched = new Set(['a', 'b', 'c']);
    expect(hiddenProductIds(rows, matched, null)).toEqual(new Set());
    expect(hiddenProductIds(rows, matched, 'ineligible')).toEqual(new Set(['b']));
  });
});
