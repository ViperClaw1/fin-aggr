import { describe, expect, it } from 'vitest';
import type { PageRequest, PageResult, ScrapeClient } from '../scrape/session';
import { queuesBySite } from './cli';
import { hasRatesWithoutJs, readHome } from './page';
import { surveyReport } from './report';
import { surveyOne, type SurveyRow, type SurveyTarget } from './run';

const HOME = `<html><head><meta name="generator" content="Drupal 10">
<script src="https://cdn.vendor-widgets.com/rates.js"></script>
<script src="/local.js"></script><script src="https://static.firstbank.com/a.js"></script></head>
<body><a href="/about">About</a><a href="/personal/cds">CDs</a>
<a href="https://www.firstbank.com/rates">Today's Rates</a>
<a href="https://other.com/rates">Partner rates</a>
<a href="/docs/truth-in-savings.pdf">Truth in Savings disclosure</a></body></html>`;

const target: SurveyTarget = {
  institutionId: 'fdic:1',
  website: 'https://www.firstbank.com/',
  timeZone: 'America/New_York',
  depositsUsdThousands: 100,
  excluded: false,
};

const ok = (url: string, html: string): PageResult => ({
  kind: 'ok',
  url,
  body: new TextEncoder().encode(html),
  status: 200,
});

function client(pages: Record<string, PageResult>, seen: PageRequest[] = []): ScrapeClient {
  return {
    get: (request) => {
      seen.push(request);
      return Promise.resolve(pages[request.url] ?? { kind: 'missing' });
    },
    flushLoad: () => undefined,
    quote: (text) => text,
  };
}

const now = () => '2026-11-26T08:00:00.000Z';

describe('survey page reading', () => {
  it('prefers a same-site link named rates and finds the Truth in Savings PDF', () => {
    const read = readHome(HOME, 'https://www.firstbank.com/');
    expect(read.ratesUrl).toBe('https://www.firstbank.com/rates');
    expect(read.disclosurePdfUrl).toBe('https://www.firstbank.com/docs/truth-in-savings.pdf');
  });

  it('fingerprints the generator and third-party script hosts only', () => {
    expect(readHome(HOME, 'https://www.firstbank.com/').fingerprint).toEqual({
      generator: 'Drupal 10',
      scriptHosts: ['cdn.vendor-widgets.com'],
    });
  });

  it('sees rates only in text a browser shows without scripts', () => {
    expect(hasRatesWithoutJs('<body><td>12 Month CD</td><td>4.25% APY</td></body>')).toBe(true);
    expect(hasRatesWithoutJs('<body><script>x="4.25% APY"</script><div id=app></div></body>')).toBe(
      false,
    );
  });
});

describe('surveyOne', () => {
  it('reads the home page, then the rates page, through the session only', async () => {
    const seen: PageRequest[] = [];
    const row = await surveyOne(
      client(
        {
          'https://www.firstbank.com/': ok('https://www.firstbank.com/', HOME),
          'https://www.firstbank.com/rates': ok(
            'https://www.firstbank.com/rates',
            '<p>4.10% APY</p>',
          ),
        },
        seen,
      ),
      target,
      now,
    );
    expect(seen.map((r) => r.sourceId)).toEqual(['bank:fdic:1', 'bank:fdic:1']);
    expect(row).toMatchObject({ status: 'ok', ratesWithoutJs: true, generator: 'Drupal 10' });
  });

  it('records a block on the rates page as blocked', async () => {
    const row = await surveyOne(
      client({
        'https://www.firstbank.com/': ok('https://www.firstbank.com/', HOME),
        'https://www.firstbank.com/rates': { kind: 'manual', reason: 'captcha' },
      }),
      target,
      now,
    );
    expect(row).toMatchObject({ status: 'blocked', blockReason: 'captcha' });
  });

  it('saves nothing outside the overnight window, so another night retries', async () => {
    const row = await surveyOne(
      client({ 'https://www.firstbank.com/': { kind: 'outside_window' } }),
      target,
      now,
    );
    expect(row).toBeNull();
  });

  it('keeps only a short code from a failure, never its message', async () => {
    const failing: ScrapeClient = {
      ...client({}),
      get: () => Promise.reject(new Error('scrape http 500')),
    };
    expect(await surveyOne(failing, target, now)).toMatchObject({
      status: 'error',
      errorCode: 'http_500',
    });
  });
});

const row = (
  id: string,
  deposits: number,
  status: SurveyRow['status'],
  extra: Partial<SurveyRow> = {},
): SurveyRow => ({
  institutionId: id,
  surveyedAt: '2026-11-26T08:00:00.000Z',
  depositsUsdThousands: deposits,
  status,
  blockReason: null,
  errorCode: null,
  homeUrl: null,
  ratesUrl: null,
  ratesWithoutJs: null,
  disclosurePdfUrl: null,
  generator: null,
  scriptHosts: [],
  ...extra,
});

describe('surveyReport', () => {
  it('builds the deposit curve and the blocked share in whole basis points', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(`fdic:${String(i)}`, 100, i === 0 ? 'blocked' : 'ok', {
        ratesWithoutJs: i % 2 === 0,
        ...(i === 0 ? { blockReason: 'blocked' } : {}),
      }),
    );
    // 10 × 100 of 3000 total: 33.33%; readable rows 2, 4, 6, 8 → 400 of 3000 = 13.33%
    const report = surveyReport(rows, 3000);
    expect(report.curve).toEqual([{ top: 10, depositsBp: 3333, readableBp: 1333 }]);
    expect(report.blockedBp).toBe(333);
    expect(report.blockReasons).toEqual({ blocked: 1 });
  });

  it('lists a script host as a cluster only from three institutions', () => {
    const rows = ['a', 'b', 'c', 'd'].map((id, i) =>
      row(`fdic:${id}`, 1, 'ok', { scriptHosts: i < 3 ? ['w.vendor.com'] : ['solo.com'] }),
    );
    expect(surveyReport(rows, 4).scriptHosts).toEqual([{ host: 'w.vendor.com', institutions: 3 }]);
  });
});

describe('queuesBySite', () => {
  it('puts institutions that share a site in one queue', () => {
    const t = (id: string, website: string): SurveyTarget => ({
      ...target,
      institutionId: id,
      website,
    });
    const queues = queuesBySite(
      [
        t('fdic:1', 'https://a.com'),
        t('fdic:2', 'https://b.com'),
        t('fdic:3', 'https://www.a.com'),
      ],
      2,
    );
    expect(queues.map((q) => q.map((x) => x.institutionId))).toEqual([
      ['fdic:1', 'fdic:3'],
      ['fdic:2'],
    ]);
  });
});
