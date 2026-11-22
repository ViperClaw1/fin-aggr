import { IsoDate } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { publishFederalBrackets } from './publish';

describe('tax table publish', () => {
  it('refuses the 2026 draft without the second checker', () => {
    expect(() => publishFederalBrackets(undefined)).toThrow('second checker');
  });

  it('marks the 2026 brackets verified by a human once confirmed', () => {
    const tables = publishFederalBrackets({
      login: 'ViperClaw1',
      verifiedAt: IsoDate.parse('2026-11-22'),
    });
    expect(tables.verification).toEqual({
      status: 'verified',
      verifiedAt: '2026-11-22',
      by: 'human',
    });
    expect(tables.tables).toHaveLength(4);
  });
});
