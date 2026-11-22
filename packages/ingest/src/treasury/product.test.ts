import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IsoDate, IsoDateTime } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { latestOffers } from './offers';
import { treasuryProducts, type Confirmation } from './product';
import { treasuryProductGaps } from './product-gaps';

const SNAPSHOT = readFileSync(join(import.meta.dirname, 'auctioned.snapshot.json'), 'utf8');
const offers = latestOffers(SNAPSHOT);
const AS_OF = IsoDate.parse('2026-11-22');
const AT = IsoDateTime.parse('2026-11-22T07:17:00.000Z');
const ALL = new Map<string, Confirmation>(
  treasuryProductGaps().map((gap) => [
    gap.id,
    { login: 'ViperClaw1', verifiedAt: IsoDate.parse('2026-11-22') },
  ]),
);

describe('treasuryProducts', () => {
  it('refuses to build anything without all five confirmations', () => {
    const partial = new Map(ALL);
    partial.delete('treasury:tax_treatment');
    expect(() => treasuryProducts(offers, partial, AT, AS_OF)).toThrow(
      'treasury facts not confirmed: treasury:tax_treatment',
    );
  });

  it('builds one parsed product per offer with stable ids', () => {
    const products = treasuryProducts(offers, ALL, AT, AS_OF);
    expect(products.map((p) => p.id)).toEqual([
      'ust:bill-13w',
      'ust:bill-26w',
      'ust:bill-52w',
      'ust:note-2y',
      'ust:note-3y',
      'ust:note-5y',
      'ust:note-7y',
      'ust:note-10y',
    ]);
  });

  it('carries the offer numbers and the confirmed terms', () => {
    const note = treasuryProducts(offers, ALL, AT, AS_OF).find((p) => p.id === 'ust:note-5y');
    const offer = offers.find((o) => o.securityTerm === '5-Year');
    expect(note).toMatchObject({
      name: '5-Year Treasury Note',
      institutionId: 'ust',
      termMonths: 60,
      compounding: 'semiannual',
      minOpening: 10_000,
      maxDeposit: 1_000_000_000,
      taxTreatment: 'state_local_exempt',
      validFrom: offer?.issueDate,
      tiers: [{ minBalance: 10_000, maxBalance: null, apy: offer?.apy }],
      earlyWithdrawal: { value: { kind: 'market_sale', holdDays: 45 } },
    });
  });

  it('marks the auction data official and the quoted terms human-verified, never mock', () => {
    const [bill] = treasuryProducts(offers, ALL, AT, AS_OF);
    expect(bill?.provenance).toMatchObject({
      sourceId: 'treasurydirect',
      isMock: false,
      verification: { status: 'verified', by: 'official_api', verifiedAt: '2026-11-22' },
    });
    expect(bill?.earlyWithdrawal.provenance).toMatchObject({
      sourceUrl:
        'https://www.treasurydirect.gov/marketable-securities/selling-marketable-securities/',
      verification: { status: 'verified', by: 'human' },
      isMock: false,
    });
  });
});
