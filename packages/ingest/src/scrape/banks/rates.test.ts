import {
  centsFromInteger,
  Product,
  rateFromPercent,
  type Product as ProductRow,
} from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { extractAllyRates } from './57803';
import { amexAdapter } from './27471';
import { PILOT_IDS } from './pilot';
import { rateIsStale, readBankPage, reviewBankProducts } from './review';
import { extractSallieRates } from './58177';

const ALLY = `
<section>
  <h3>Savings</h3>
  <p>Access your money at any time.</p>
  <p>3.2% correct as of 11/12/26</p>
  <p>Interest compounded daily</p>
  <p>No monthly maintenance fees or minimum opening deposit</p>
</section>
<section>
  <h3>High Yield CD</h3>
  <p>AVAILABLE TERMS</p>
  <p>2.9% correct as of 11/12/26</p>
  <p>Early withdrawal penalty will apply</p>
</section>`;

const SALLIE = `
<div class="cmp-rate-cards">
  <div class="cmp-rate-card-wrapper"><div class="cmp-tag-v2">15-month CD</div><p class="cmp-rate-label">4.65%</p></div>
  <div class="cmp-rate-card-wrapper"><div class="cmp-tag-v2">60-month CD</div><p class="cmp-rate-label">5.00%</p></div>
  <div class="cmp-rate-card-wrapper"><div class="cmp-tag-v2">12-month CD</div><p class="cmp-rate-label">4.60%</p></div>
  <div class="cmp-rate-card-wrapper"><div class="cmp-tag-v2">18-month CD</div><p class="cmp-rate-label">4.65%</p></div>
  <div class="cmp-rate-card-wrapper"><div class="cmp-tag-v2">36-month CD</div><p class="cmp-rate-label">4.75%</p></div>
</div>
<p>The minimum deposit and balance is $2,500, and your returns are guaranteed.</p>
<p>compounded interest gets credited to your CD monthly.</p>
<p>accurate as of 11/16/2026</p>`;

describe('pilot bank pages', () => {
  it('uses the three owner certificates', () => {
    expect(PILOT_IDS).toEqual(['fdic:57803', 'fdic:27471', 'fdic:58177']);
    expect(amexAdapter).toMatchObject({ kind: 'json', jsonPath: 'interestRateList' });
  });

  it('reads the Ally savings card and skips a CD that states no term', () => {
    const rows = extractAllyRates(ALLY);
    expect(rows).toEqual([
      {
        name: 'Savings',
        category: 'savings',
        termMonths: null,
        apyPercent: '3.2',
        asOf: '2026-11-12',
        minDollars: '0',
        compounding: 'daily',
        penaltyDays: null,
        quote: 'Access your money at any time.',
      },
    ]);
    // independent calc: 3.2% moves the point two places, $0 is 0 cents
    expect(rateFromPercent('3.2')).toBe('0.032');
    expect(centsFromInteger('0')).toBe(0);
  });

  it('reads each Sallie Mae term, the shared minimum, and the penalty by term', () => {
    const rows = extractSallieRates(SALLIE);
    expect(rows.map((row) => [row.termMonths, row.apyPercent, row.penaltyDays])).toEqual([
      [15, '4.65', 180],
      [60, '5.00', 180],
      [12, '4.60', 90],
      [18, '4.65', 180],
      [36, '4.75', 180],
    ]);
    expect(rows[0]).toMatchObject({
      asOf: '2026-11-16',
      minDollars: '2500',
      compounding: 'monthly',
    });
    // independent calc: $2,500 is 250000 cents; 4.65% is 0.0465; 5.00% is 0.05
    expect(centsFromInteger('250000')).toBe(250000);
    expect(rateFromPercent('4.65')).toBe('0.0465');
    expect(rateFromPercent('5.00')).toBe('0.05');
  });
});

function sample(id: string, asOf: string): ProductRow {
  return Product.parse({
    id,
    institutionId: 'fdic:1',
    category: 'savings',
    name: 'Savings',
    termMonths: null,
    tierMode: 'whole_balance',
    tiers: [{ minBalance: 0, maxBalance: null, apy: '0.032' }],
    compounding: 'daily',
    minOpening: 0,
    maxDeposit: null,
    earlyWithdrawal: {
      value: { kind: 'none' },
      provenance: {
        sourceId: 'bank:fdic:1',
        sourceUrl: 'https://www.example.com/rates',
        retrievedAt: '2026-11-16T00:00:00Z',
        verification: { status: 'unverified' },
        isMock: false,
      },
    },
    eligibility: { op: 'and', args: [] },
    taxTreatment: 'taxable',
    validFrom: asOf,
    validTo: null,
    provenance: {
      sourceId: 'bank:fdic:1',
      sourceUrl: 'https://www.example.com/rates',
      retrievedAt: '2026-11-16T00:00:00Z',
      verification: { status: 'unverified' },
      isMock: false,
    },
  });
}

describe('bank product review', () => {
  const rows = [sample('fdic:1:savings', '2026-11-12')];

  it('holds every row on the first connection', () => {
    const report = reviewBankProducts({
      rows,
      previous: [],
      confirmed: false,
      retrievedDay: '2026-11-16',
    });
    expect(report.clean).toEqual([]);
    expect(report.suspicious.map((row) => row.reasons)).toEqual(
      rows.map(() => ['first_connection']),
    );
  });

  it('after confirmation, holds a page date older than 180 days and publishes the rest', () => {
    const old = sample('fdic:1:old', '2025-01-01');
    const fresh = sample('fdic:1:new', '2026-11-12');
    const report = reviewBankProducts({
      rows: [old, fresh],
      previous: [],
      confirmed: true,
      retrievedDay: '2026-11-16',
    });
    expect(report.suspicious).toEqual([{ key: old.id, reasons: ['stale'] }]);
    expect(report.clean.map((row) => row.id)).toEqual([fresh.id]);
    expect(rateIsStale('2025-01-01', '2026-11-16')).toBe(true);
    expect(rateIsStale('2026-11-12', '2026-11-16')).toBe(false);
  });

  it('a broken adapter is manual and returns no rows to publish', () => {
    const read = readBankPage(() => {
      throw new Error('selector missing');
    });
    expect(read).toEqual({ ok: false, reason: 'adapter' });
  });
});
