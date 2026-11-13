import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkLiveShapes } from './live';
import { zipTables } from './ncua/zip';

function read(path: string): string {
  return readFileSync(join(import.meta.dirname, path), 'utf8');
}

function hrefOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (
    typeof input === 'object' &&
    input !== null &&
    'url' in input &&
    typeof input.url === 'string'
  ) {
    return input.url;
  }
  return '';
}

describe('nightly live shape', () => {
  const previousKey = process.env['FRED_API_KEY'];

  afterEach(() => {
    if (previousKey === undefined) delete process.env['FRED_API_KEY'];
    else process.env['FRED_API_KEY'] = previousKey;
  });

  it('prints one line per source and treats an eCFR change as success', async () => {
    process.env['FRED_API_KEY'] = 'test-key';
    const lines = await checkLiveShapes((input) => {
      const url = hrefOf(input);
      if (url.includes('/banks/financials')) {
        return Promise.resolve(
          new Response(read('fdic/financials.snapshot.json'), { status: 200 }),
        );
      }
      if (url.includes('api.fdic.gov')) {
        return Promise.resolve(
          new Response(read('fdic/institutions.snapshot.json'), { status: 200 }),
        );
      }
      if (url.includes('ecfr.gov')) {
        return Promise.resolve(new Response(read('ecfr/versions-330.json'), { status: 200 }));
      }
      if (url.includes('daily-treasury-rates.csv')) {
        return Promise.resolve(
          new Response(read('treasury/par-yield.snapshot.csv'), { status: 200 }),
        );
      }
      if (url.includes('quarterly-data')) {
        return Promise.resolve(
          new Response(
            '<a href="/files/publications/analysis/call-report-data-2026-06.zip">Select</a>',
            { status: 200 },
          ),
        );
      }
      if (url.includes('call-report-data-')) {
        const zip = zipTables({
          'AcctDesc.txt': '"Account","AcctName"\n"Acct_010","TOTAL ASSETS"\n',
        });
        return Promise.resolve(new Response(Buffer.from(zip), { status: 206 }));
      }
      if (url.includes('stlouisfed.org')) {
        return Promise.resolve(
          new Response(JSON.stringify({ observations: [{ date: '2026-10-01', value: '0.38' }] }), {
            status: 200,
          }),
        );
      }
      if (url.includes('fiscaldata.treasury.gov')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  cusip: '912797WF0',
                  security_type: 'Bill',
                  security_term: '4-Week',
                  issue_date: '2026-11-17',
                  maturity_date: '2026-12-15',
                  high_yield: 'null',
                  int_rate: 'null',
                  int_payment_frequency: 'null',
                  min_to_issue: 'null',
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('treasurydirect.gov')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                cusip: '912797WF0',
                securityType: 'Bill',
                securityTerm: '4-Week',
                issueDate: '2026-11-17T00:00:00',
                maturityDate: '2026-12-15T00:00:00',
                highRate: '3.955',
                investmentRate: '4.022',
                interestRate: '',
                frequencyOfInterestPayments: '',
                minimumToIssueAmount: '100',
              },
            ]),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(read('register/documents.snapshot.json'), { status: 200 }),
      );
    });
    expect(lines).toEqual([
      'fdic institutions shape ok',
      'fdic financials shape ok',
      'ecfr 330 unchanged',
      'federal register shape ok',
      'treasury par yield shape ok',
      'ncua 5300 shape ok',
      'fdic national rates shape ok',
      'treasury fiscal data shape ok',
      'treasurydirect shape ok',
    ]);
  });
});
