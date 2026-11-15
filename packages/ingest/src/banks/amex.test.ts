import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAmexRates, publishAmexProducts, type AmexOffer } from './amex';

const RETRIEVED_AT = '2026-11-15T10:35:17.000Z';
const fixture = readFileSync(join(import.meta.dirname, 'amex.fixture.json'), 'utf8');

function offer(parsed: ReturnType<typeof parseAmexRates>, bankType: string): AmexOffer {
  if (parsed.kind !== 'rows') throw new Error('expected rows');
  const row = parsed.offers.find((item) => item.bankType === bankType);
  if (row === undefined) throw new Error(`missing ${bankType}`);
  return row;
}

describe('American Express rates JSON', () => {
  it('maps the trimmed fixture by hand, and drops a zero APY and an IRA row', () => {
    const parsed = parseAmexRates(fixture, RETRIEVED_AT);
    expect(parsed.kind).toBe('rows');
    if (parsed.kind !== 'rows') return;
    expect(parsed.offers.map((row) => row.bankType)).toEqual(['3510', '3512', '3200']);
    expect(parsed.skipped).toEqual([{ bankType: '3503', reason: 'not_offered' }]);
    expect(parsed.excluded).toEqual([
      {
        bankType: '3706',
        description: 'IRA 6-Month Certificate of Deposit',
        reason: 'ira',
      },
    ]);
    // independent calc: 4.5% = 45/1000 = 0.045; 3.75% = 375/10000 = 0.0375; 3.2% = 32/1000 = 0.032
    expect(offer(parsed, '3510')).toMatchObject({
      productId: 'fdic:27471:3510',
      category: 'cd',
      termMonths: 10,
      apy: '0.045',
      asOf: '2026-11-11',
    });
    expect(offer(parsed, '3512')).toMatchObject({
      category: 'cd',
      termMonths: 12,
      apy: '0.0375',
      description: '12-Month Certificate of Deposit',
      asOf: '2026-11-11',
    });
    expect(offer(parsed, '3200')).toMatchObject({
      category: 'savings',
      termMonths: null,
      apy: '0.032',
      description: 'High Yield Savings Account',
    });
    expect(parsed.offers.some((row) => row.apy === '0' || row.asOf === '2026-11-15')).toBe(false);
  });

  it('reviews a rate older than 180 days and does not publish it', () => {
    const body = JSON.stringify({
      interestRateList: [
        {
          term: '12M',
          rate: '3.68158',
          apy: 3.75,
          type: '3512',
          rateCode: 'CD',
          description: '12-Month Certificate of Deposit',
          effectiveDate: '2026-01-01',
        },
      ],
    });
    const parsed = parseAmexRates(body, RETRIEVED_AT);
    expect(parsed).toMatchObject({
      kind: 'rows',
      offers: [],
      review: [{ bankType: '3512', reason: 'stale' }],
    });
  });

  it('reviews an APY whose decimal text is longer than six places', () => {
    const body = JSON.stringify({
      interestRateList: [
        {
          term: '12M',
          rate: '1.2',
          apy: 1.1234567,
          type: '3512',
          rateCode: 'CD',
          description: '12-Month Certificate of Deposit',
          effectiveDate: '2026-11-11',
        },
      ],
    });
    const parsed = parseAmexRates(body, RETRIEVED_AT);
    expect(parsed).toMatchObject({
      kind: 'rows',
      offers: [],
      review: [{ bankType: '3512', reason: 'apy_format:1.1234567' }],
    });
  });

  it('does not publish while minimum, tiers, penalty, and eligibility are unconfirmed', () => {
    expect(() => publishAmexProducts()).toThrow(
      /min_opening, tiers, early_withdrawal, eligibility/,
    );
  });
});
