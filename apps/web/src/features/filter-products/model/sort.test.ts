import { describe, expect, it } from 'vitest';
import { effectiveSort, sortParser, type ProductSort } from './sort';

const NET: ProductSort = { columnId: 'netYield', direction: 'desc' };

describe('sortParser', () => {
  it('reads a key and a direction', () => {
    expect(sortParser.parse('netYield.asc')).toEqual({ columnId: 'netYield', direction: 'asc' });
  });
  it.each(['apy', 'apy.up', 'price.desc', 'apy.desc.x', ''])('rejects %j', (value) => {
    expect(sortParser.parse(value)).toBeNull();
  });
  it('writes key.direction', () => {
    expect(sortParser.serialize({ columnId: 'apy', direction: 'desc' })).toBe('apy.desc');
  });
});

describe('effectiveSort', () => {
  it('keeps a sort on a shown column', () => {
    expect(effectiveSort(NET, ['apy', 'netYield'])).toEqual(NET);
  });
  it('is the default order (null) while the column is not shown, the request untouched', () => {
    const requested = { ...NET };
    expect(effectiveSort(requested, ['apy', 'term'])).toBeNull();
    expect(requested).toEqual(NET);
  });
  it('is the default order (null) without a sort, so a header cycle ends there', () => {
    expect(effectiveSort(null, ['apy'])).toBeNull();
  });
});
