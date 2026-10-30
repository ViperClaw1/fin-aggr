import { describe, expect, it } from 'vitest';
import { filterBanks } from './search';

const rows = [
  { name: 'Alder Bank', kind: 'direct_bank' as const },
  { name: 'Birch Credit Union', kind: 'credit_union' as const },
  { name: 'Cedar Pay', kind: 'fintech_partner' as const },
];

describe('filterBanks', () => {
  it('matches the name and the kind, and an empty query keeps everything of that kind', () => {
    expect(filterBanks(rows, 'birch', null).map((r) => r.name)).toEqual(['Birch Credit Union']);
    expect(filterBanks(rows, '', 'credit_union').map((r) => r.name)).toEqual([
      'Birch Credit Union',
    ]);
    expect(filterBanks(rows, 'bank', 'fintech_partner')).toEqual([]);
  });
});
