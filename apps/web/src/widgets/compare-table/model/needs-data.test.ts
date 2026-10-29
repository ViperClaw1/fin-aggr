import type { RankedProduct } from '@fa/engine';
import { describe, expect, it } from 'vitest';
import { needsData } from './needs-data';

const r = (group: RankedProduct['group'], missingFields: string[] = []) =>
  ({ group, eligibility: { status: group, missingFields } }) as unknown as RankedProduct;

describe('needsData', () => {
  it('is null without a ranking or when every product is decided', () => {
    expect(needsData(null)).toBeNull();
    expect(needsData([r('eligible'), r('ineligible')])).toBeNull();
  });
  it('counts undecided products and maps rule fields to form fields, once, in a fixed order', () => {
    expect(
      needsData([
        r('needs_profile', ['age']),
        r('needs_profile', ['depositAmount', 'age']),
        r('eligible'),
      ]),
    ).toEqual({
      count: 2,
      fields: [
        { rule: 'age', form: 'age' },
        { rule: 'depositAmount', form: 'principal' },
      ],
    });
  });
});
