// Lives in shared/api because only this segment may import fixtures (FIXTURES_BAN).
import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { describe, expect, it } from 'vitest';
import { US_STATES } from '@/shared/config';

describe('US_STATES', () => {
  it('lists 51 unique codes (50 states and DC)', () => {
    expect(new Set(US_STATES.map((s) => s.code)).size).toBe(51);
  });

  it('offers only states the tax tables cover, so the engine never meets an unknown state', () => {
    const covered = Object.keys(generateFixtures(DEFAULT_SEED).taxTables.states);
    const missing = US_STATES.map((s) => s.code).filter((code) => !covered.includes(code));
    expect(missing).toEqual([]);
  });
});
