import { describe, expect, it } from 'vitest';
import { effectiveSort, sortParser, type ProductSort } from './sort';

const BY_APY: ProductSort = { columnId: 'apy', direction: 'desc' };

describe('sortParser', () => {
  it('reads a key and a direction', () => {
    expect(sortParser.parse('netYield.asc')).toEqual({ columnId: 'netYield', direction: 'asc' });
  });
  it.each(['apy', 'apy.up', 'price.desc', 'apy.desc.x', ''])('rejects %j', (value) => {
    expect(sortParser.parse(value)).toBeNull();
  });
  it('writes key.direction', () => {
    expect(sortParser.serialize(BY_APY)).toBe('apy.desc');
  });
});

describe('effectiveSort', () => {
  it('keeps a sort on a shown column', () => {
    const net: ProductSort = { columnId: 'netYield', direction: 'desc' };
    expect(effectiveSort(net, ['apy', 'netYield'], BY_APY)).toEqual(net);
  });
  it('falls back while the column is not shown (profile incomplete)', () => {
    const net: ProductSort = { columnId: 'netYield', direction: 'desc' };
    expect(effectiveSort(net, ['apy', 'term'], BY_APY)).toEqual(BY_APY);
  });
  it('falls back without a sort in the URL', () => {
    expect(effectiveSort(null, ['apy'], BY_APY)).toEqual(BY_APY);
  });
});
