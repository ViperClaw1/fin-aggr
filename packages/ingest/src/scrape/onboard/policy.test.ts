import { describe, expect, it } from 'vitest';
import type { Sql } from '../../decisions';
import { SALLIE_CONFIG } from '../banks/configs';
import { storeProposal } from './cli';
import { publicationHolds, sampleOf, templateOf } from './policy';
import type { Proposal } from './propose';
import { isoWeek } from './sample';

const PAGE = `<html><body>
<table><caption>Certificate of Deposit (CD) rates table showing terms and APYs.</caption>
<tr><th>Terms</th><th>APY</th></tr>
<tr><td>6 months</td><td>3.20% APY</td></tr></table>
<p>The minimum deposit and balance is $2,500, and your returns are guaranteed.</p>
<p>The compounded interest gets credited to your CD monthly.</p>
<p>Certificates of Deposit may change after maturity, applies to personal accounts only, and are accurate as of 11/16/2026.</p>
<p>If your CD has a maturity of twelve (12) months or less, the penalty we impose will equal ninety (90) days’ simple interest on the amount withdrawn subject to penalty.</p>
<p>If your CD has a maturity greater than twelve (12) months, the penalty we impose will equal one hundred eighty (180) days’ simple interest on the amount withdrawn subject to penalty.</p>
</body></html>`;

describe('publicationHolds', () => {
  const clean = { failures: [], humanApproved: 10, stopped: false, pending: [] };

  it('publishes automatically only when nothing holds', () => {
    expect(publicationHolds(clean)).toEqual([]);
  });

  it('holds a failed check, a stopped template and the first 10 of a template', () => {
    expect(publicationHolds({ ...clean, failures: ['quote_not_in_snapshot:12'] })).toEqual([
      'quote_not_in_snapshot:12',
    ]);
    expect(publicationHolds({ ...clean, stopped: true })).toEqual(['template_stopped']);
    expect(publicationHolds({ ...clean, humanApproved: 9 })).toEqual(['first_10_of_template']);
  });

  it('holds everything while checks 5 and 7 are not run', () => {
    expect(publicationHolds({ failures: [], humanApproved: 10, stopped: false })).toEqual([
      'checks_pending:apy_rate,national_outlier',
    ]);
  });
});

describe('templates and the weekly sample', () => {
  it('names a template by kind and survey generator', () => {
    expect(templateOf('html_table', 'WordPress 6.4')).toBe('html_table:wordpress-6.4');
    expect(templateOf('html_table', null)).toBe('html_table:unknown');
  });

  it('samples a tenth, rounded up, the same pick within a week', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `bank:fdic:${String(i)}`);
    // independent calc: ceil(25 / 10) = 3
    expect(sampleOf(ids, '2026-W48')).toHaveLength(3);
    expect(sampleOf(ids, '2026-W48')).toEqual(sampleOf([...ids].reverse(), '2026-W48'));
    expect(sampleOf([], '2026-W48')).toEqual([]);
  });

  it('dates the ISO week', () => {
    // independent calc: 2026-11-26 is a Thursday in ISO week 48; 2027-01-01 is a Friday in 2026-W53
    expect(isoWeek('2026-11-26T10:00:00.000Z')).toBe('2026-W48');
    expect(isoWeek('2027-01-01T10:00:00.000Z')).toBe('2026-W53');
  });
});

function fakeSql(approved: number): { sql: Sql; texts: string[] } {
  const texts: string[] = [];
  const sql: Sql = {
    query: (text) => {
      const t = text.replace(/\s+/g, ' ').trim();
      texts.push(t);
      if (t.includes('from survey_results'))
        return Promise.resolve({ rows: [{ generator: null }] });
      if (t.includes('template_stops where'))
        return Promise.resolve({ rows: [{ approved, stopped: false }] });
      if (t.startsWith('insert into adapter_configs'))
        return Promise.resolve({ rows: [{ id: 5 }] });
      if (t.includes("status = 'proposed'")) {
        return Promise.resolve({
          rows: [{ institution_id: 'fdic:58177', config: SALLIE_CONFIG }],
        });
      }
      if (t.startsWith('insert into review_queue')) return Promise.resolve({ rows: [{ id: 9 }] });
      return Promise.resolve({ rows: [] });
    },
  };
  return { sql, texts };
}

const proposal: Proposal = {
  model: 'claude-opus-5-5',
  promptVersion: 'test',
  config: SALLIE_CONFIG,
  products: [],
  failures: [],
  usage: { inputTokens: 0, outputTokens: 0 },
};

const input = {
  institutionId: 'fdic:58177',
  sourceId: 'bank:fdic:58177',
  snapshotId: 11,
  proposal,
  html: PAGE,
  now: () => '2026-11-26T10:00:00.000Z',
};

describe('storeProposal', () => {
  it('queues a clean proposal of a template with fewer than 10 approved institutions', async () => {
    const { sql, texts } = fakeSql(3);
    expect(await storeProposal(sql, { ...input, pending: [] })).toBe(
      'review=9 template=html_table:unknown',
    );
    expect(texts.some((t) => t.includes('automated_check'))).toBe(false);
  });

  it('confirms the bank and its products by automated_check when nothing holds', async () => {
    const { sql, texts } = fakeSql(10);
    expect(await storeProposal(sql, { ...input, pending: [] })).toBe(
      'automated config=5 template=html_table:unknown',
    );
    expect(texts.some((t) => t.startsWith('insert into review_queue'))).toBe(false);
    expect(
      texts.filter((t) => t.startsWith('insert into bank_product_confirmations')),
    ).toHaveLength(1);
    expect(texts.at(-1)).toBe('commit');
  });

  it('never automates a proposal whose quote is not in the snapshot', async () => {
    const { sql } = fakeSql(10);
    const failed = { ...proposal, failures: ['quote_not_in_snapshot:6'] };
    expect(await storeProposal(sql, { ...input, proposal: failed, pending: [] })).toMatch(
      /^review=9/,
    );
  });
});
