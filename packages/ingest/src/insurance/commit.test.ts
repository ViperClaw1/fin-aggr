import { IsoDate } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { confirmedLimits } from './commit';

const day = IsoDate.parse('2026-11-24');

describe('confirmed insurance limits', () => {
  it('refuses to build limits while a quote is unconfirmed, naming it', () => {
    expect(() => confirmedLimits(new Map([['insurance:fdic', day]]))).toThrow(
      /unconfirmed: .*insurance:ncua/,
    );
  });

  it('takes $250,000 per owner from each saved quote as cents', () => {
    const limits = confirmedLimits(
      new Map([
        ['insurance:fdic', day],
        ['insurance:ncua', day],
      ]),
    );
    // independent calc: 12 CFR 330.1(o) and 745.1(e) print $250,000; × 100 = 25 000 000 cents
    expect(limits.map((limit) => [limit.regulator, limit.limitPerOwner])).toEqual([
      ['FDIC', 25000000],
      ['NCUA', 25000000],
    ]);
  });

  it('marks each limit verified by a human on its confirmation day, not as a mock', () => {
    const [fdic] = confirmedLimits(
      new Map([
        ['insurance:fdic', day],
        ['insurance:ncua', IsoDate.parse('2026-11-25')],
      ]),
    );
    expect(fdic?.provenance.verification).toEqual({
      status: 'verified',
      verifiedAt: '2026-11-24',
      by: 'human',
    });
    expect(fdic?.provenance.isMock).toBe(false);
  });
});
