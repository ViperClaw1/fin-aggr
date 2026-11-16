import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  centsFromInteger,
  Product,
  rateFromPercent,
  type Product as ProductRow,
} from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { extractAllyRates } from './57803';
import { amexAdapter, readAmex } from './27471';
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

const SALLIE_FACTS = `
<p>The minimum deposit and balance is $2,500, and your returns are guaranteed.</p>
<p>The compounded interest gets credited to your CD monthly.</p>
<p>Certificates of Deposit may change after maturity, applies to personal accounts only, and are accurate as of 11/16/2026.</p>
<p>If your CD has a maturity of twelve (12) months or less, the penalty we impose will equal ninety (90) days’ simple interest on the amount withdrawn subject to penalty.</p>
<p>If your CD has a maturity greater than twelve (12) months, the penalty we impose will equal one hundred eighty (180) days’ simple interest on the amount withdrawn subject to penalty.</p>`;

const SALLIE = `
<table>
  <caption>Certificate of Deposit (CD) rates table showing available terms and corresponding APYs.</caption>
  <tr><th>Terms</th><th>APY</th></tr>
  <tr><td>6 months</td><td>3.20% APY</td></tr>
  <tr><td>12 months</td><td>4.60% APY</td></tr>
  <tr><td>13 months</td><td>4.50% APY</td></tr>
</table>
${SALLIE_FACTS}`;

const SALLIE_CARDS = `
<div class="cmp-rate-card-wrapper"><div class="cmp-tag-v2">12-month CD</div><p class="cmp-rate-label">4.60%</p></div>
${SALLIE_FACTS}`;

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

  it('reads each Sallie Mae table row, the shared minimum, and the penalty sentence for that term', () => {
    const rows = extractSallieRates(SALLIE);
    expect(rows.map((row) => [row.termMonths, row.apyPercent, row.penaltyDays])).toEqual([
      [6, '3.20', 90],
      [12, '4.60', 90],
      [13, '4.50', 180],
    ]);
    expect(rows[0]).toMatchObject({
      asOf: '2026-11-16',
      minDollars: '2500',
      compounding: 'monthly',
    });
    expect(rows[0]?.quote).toContain('(90)');
    expect(rows[2]?.quote).toContain('(180)');
    // independent calc: $2,500 is 250000 cents; 4.60% is 0.046; 3.20% is 0.032
    expect(centsFromInteger('250000')).toBe(250000);
    expect(rateFromPercent('4.60')).toBe('0.046');
    expect(rateFromPercent('3.20')).toBe('0.032');
  });

  it('does not read Sallie Mae flip cards when the rate table is absent', () => {
    expect(extractSallieRates(SALLIE_CARDS)).toEqual([]);
  });

  it('does not invent a Sallie Mae penalty when the page has no day count', () => {
    const html = SALLIE.replace(/ninety \(90\) days’ simple interest/g, 'a penalty');
    expect(extractSallieRates(html)).toEqual([]);
  });

  it('reads Amex CD penalties from the page quotes and the APY from the JSON', () => {
    const fixture = readFileSync(
      join(import.meta.dirname, '../../banks/amex.fixture.json'),
      'utf8',
    );
    const extracted = readAmex(fixture, '2026-11-15');
    const cds = extracted.products.filter((row) => row.category === 'cd');
    expect(cds.map((row) => [row.termMonths, row.earlyWithdrawal.value])).toEqual([
      [10, { kind: 'days_of_interest', days: 90 }],
      [12, { kind: 'days_of_interest', days: 270 }],
    ]);
    expect(cds[0]?.earlyWithdrawal.provenance.document?.quote).toContain('90 days');
    expect(cds[1]?.earlyWithdrawal.provenance.document?.quote).toContain('270 days');
    expect(extracted.products.some((row) => row.category === 'savings')).toBe(true);
    const sixty = readAmex(
      JSON.stringify({
        interestRateList: [
          {
            term: '60M',
            rate: '4.0',
            apy: 4,
            type: '3560',
            rateCode: 'CD',
            description: '60-Month Certificate of Deposit',
            effectiveDate: '2026-11-11',
          },
        ],
      }),
      '2026-11-15',
    );
    expect(sixty.products[0]?.earlyWithdrawal.value).toEqual({
      kind: 'days_of_interest',
      days: 540,
    });
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
      previous: [old, fresh],
      confirmed: true,
      retrievedDay: '2026-11-16',
    });
    expect(report.suspicious).toEqual([{ key: old.id, reasons: ['stale'] }]);
    expect(report.clean.map((row) => row.id)).toEqual([fresh.id]);
    expect(rateIsStale('2025-01-01', '2026-11-16')).toBe(true);
    expect(rateIsStale('2026-11-12', '2026-11-16')).toBe(false);
  });

  it('holds a new product of a confirmed bank as a first connection', () => {
    const known = sample('fdic-27471-savings', '2026-11-11');
    const added = sample('fdic-27471-3510', '2026-11-11');
    const report = reviewBankProducts({
      rows: [known, added],
      previous: [known],
      confirmed: true,
      retrievedDay: '2026-11-16',
    });
    expect(report.clean.map((row) => row.id)).toEqual([known.id]);
    expect(report.suspicious).toEqual([{ key: added.id, reasons: ['first_connection'] }]);
  });

  it('a broken adapter is manual and returns no rows to publish', () => {
    const read = readBankPage(() => {
      throw new Error('selector missing');
    });
    expect(read).toEqual({ ok: false, reason: 'adapter' });
  });
});
