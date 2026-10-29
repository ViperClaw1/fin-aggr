// URL keys of all features in one place (app is the layer that may see them all): links people
// share never carry profile fields (ADR-004), and filters never take the citation keys.
import { Profile } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { PROFILE_DRAWER_KEY } from '@/entities/profile';
import { PRODUCT_FILTER_KEYS } from '@/features/filter-products';
import { CITATION_KEYS } from '@/features/open-citation';

const profileKeys = [...Object.keys(Profile.shape), ...Object.keys(Profile.shape.scenario.shape)];
const allKeys: string[] = [...PRODUCT_FILTER_KEYS, ...CITATION_KEYS, PROFILE_DRAWER_KEY];

describe('URL keys', () => {
  it('filters use exactly the agreed keys', () => {
    expect([...PRODUCT_FILTER_KEYS].sort()).toEqual(
      ['hide', 'kind', 'maxOpening', 'minApy', 'search', 'term'].sort(),
    );
  });
  it('the citation owns doc, page and q', () => {
    expect([...CITATION_KEYS].sort()).toEqual(['doc', 'page', 'q']);
  });
  it('the profile drawer owns profile', () => {
    expect(PROFILE_DRAWER_KEY).toBe('profile');
  });
  it('no two owners share a key', () => {
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });
  it('no URL key is a profile field, including the scenario (ADR-004)', () => {
    expect(allKeys.filter((k) => profileKeys.includes(k))).toEqual([]);
  });
});
