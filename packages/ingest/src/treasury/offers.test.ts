import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { billApy, noteApy } from './apy';
import { latestOffers } from './offers';

// 22 rows of TreasuryDirect /TA_WS/securities/auctioned, read 2026-11-22.
const SNAPSHOT = readFileSync(join(import.meta.dirname, 'auctioned.snapshot.json'), 'utf8');

describe('latestOffers', () => {
  const offers = latestOffers(SNAPSHOT);

  it('keeps one offer per published term, ordered by term', () => {
    expect(offers.map((o) => `${o.securityType} ${o.securityTerm}`)).toEqual([
      'Bill 13-Week',
      'Bill 26-Week',
      'Bill 52-Week',
      'Note 2-Year',
      'Note 3-Year',
      'Note 5-Year',
      'Note 7-Year',
      'Note 10-Year',
    ]);
  });

  it('takes the newest issue of each term', () => {
    const byTerm = Object.fromEntries(offers.map((o) => [o.securityTerm, o.cusip]));
    expect(byTerm['13-Week']).toBe('912797TV9'); // 2026-11-19, a reopening
    expect(byTerm['52-Week']).toBe('912797WT0'); // 2026-10-29
    expect(byTerm['10-Year']).toBe('91282CRX1'); // 2026-11-16
  });

  it('leaves out the FRN issued the same day as the 2-year note', () => {
    expect(offers.find((o) => o.securityTerm === '2-Year')?.cusip).toBe('91282CRU7');
    expect(offers.some((o) => o.cusip === '91282CRS2')).toBe(false);
  });

  it('leaves out TIPS, cash management bills, short bills, bonds and odd terms', () => {
    const cusips = offers.map((o) => o.cusip);
    for (const left of ['91282CRR4', '912797VA2', '912797VJ3', '912810UZ9', '91282CRF0']) {
      expect(cusips).not.toContain(left);
    }
  });

  it('prices bills from the auction price and notes from the high yield', () => {
    const bill = offers.find((o) => o.securityTerm === '26-Week');
    const note = offers.find((o) => o.securityTerm === '5-Year');
    // 2026-11-19 → 2027-05-20 is 182 days; price 97.821056; 5-year high yield 4.845%
    expect(bill).toMatchObject({ daysToMaturity: 182, compounding: 'at_maturity' });
    expect(bill?.apy).toBe(billApy('97.821056', 182));
    expect(note).toMatchObject({ compounding: 'semiannual', termMonths: 60 });
    expect(note?.apy).toBe(noteApy('4.845'));
  });

  it('reads the minimum to bid and the noncompetitive maximum as cents', () => {
    for (const o of offers) {
      expect(o.minOpening).toBe(10_000); // $100
      expect(o.maxDeposit).toBe(1_000_000_000); // $10,000,000
    }
  });

  it('skips an announced auction that has no result yet', () => {
    const rows = JSON.parse(SNAPSHOT) as Record<string, unknown>[];
    const pending = { ...rows[0], issueDate: '2026-12-31T00:00:00', highPrice: '' };
    const again = latestOffers(JSON.stringify([pending, ...rows]));
    expect(again.find((o) => o.securityTerm === '13-Week')?.cusip).toBe('912797TV9');
  });
});
