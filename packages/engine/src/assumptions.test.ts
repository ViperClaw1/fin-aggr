import { describe, expect, it } from 'vitest';
import { allAssumptions } from './assumptions';

describe('allAssumptions', () => {
  it('lists each assumption once, including the ones only some products carry', () => {
    const ids = allAssumptions().map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'niit_amt_ignored',
        'treasury_effective_yield',
        'day_count_365',
        'no_pass_through_insurance',
        'limits_from_reference',
      ]),
    );
  });
});
