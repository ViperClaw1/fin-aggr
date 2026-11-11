import { describe, expect, it } from 'vitest';
import {
  assertPublicPage,
  blockReason,
  isOvernight,
  optOutLate,
  scrapeUserAgent,
  shortQuote,
} from './rules';

const NIGHT = '2026-11-11T08:00:00.000Z';

describe('public pages', () => {
  it('keeps an https rates page and the registrable domain', () => {
    expect(assertPublicPage('https://www.example.com/rates#top')).toEqual({
      href: 'https://www.example.com/rates',
      originHost: 'www.example.com',
      domain: 'example.com',
    });
    expect(assertPublicPage('https://rates.bank.co.uk/cds').domain).toBe('bank.co.uk');
  });

  it('rejects a page that is not a public https document', () => {
    const rejected = [
      'http://www.example.com/rates',
      'https://user:secret@www.example.com/rates',
      'https://www.example.com:8443/rates',
      'https://www.example.com/login',
      'https://www.example.com/rates?token=1',
      'https://1.2.3.4/rates',
      'not a url',
    ];
    for (const url of rejected) {
      expect(() => assertPublicPage(url)).toThrow('scrape url is not public');
    }
  });
});

describe('scrape identity', () => {
  it('names the project, the site, and the project mailbox', () => {
    expect(scrapeUserAgent('ops@fin-aggr.example')).toBe(
      'FA (+https://fin-aggr.vercel.app; ops@fin-aggr.example)',
    );
  });

  it('refuses a run without a mailbox', () => {
    expect(() => scrapeUserAgent(undefined)).toThrow(/FA_SCRAPE_MAILBOX/);
    expect(() => scrapeUserAgent('not-an-address')).toThrow(/FA_SCRAPE_MAILBOX/);
  });
});

describe('overnight window', () => {
  it('is 22:00–06:00 in the bank time zone', () => {
    expect(isOvernight(NIGHT, 'America/New_York')).toBe(true);
    expect(isOvernight(NIGHT, 'Pacific/Honolulu')).toBe(true);
    expect(isOvernight('2026-11-11T15:00:00.000Z', 'America/New_York')).toBe(false);
    expect(isOvernight('2026-11-11T02:00:00.000Z', 'America/New_York')).toBe(false);
  });

  it('rejects a bad clock or time zone', () => {
    expect(() => isOvernight('yesterday', 'America/New_York')).toThrow(/time/i);
    expect(() => isOvernight(NIGHT, 'Not/A_Zone')).toThrow(/time zone/i);
  });
});

describe('opt-out deadline', () => {
  it('is late only after 24 hours', () => {
    expect(optOutLate('2026-11-11T00:00:00.000Z', '2026-11-12T00:00:00.000Z')).toBe(false);
    expect(optOutLate('2026-11-11T00:00:00.000Z', '2026-11-12T00:00:00.001Z')).toBe(true);
  });

  it('rejects an application that precedes the request', () => {
    expect(() => optOutLate('2026-11-12T00:00:00.000Z', '2026-11-11T00:00:00.000Z')).toThrow(
      /before/i,
    );
  });
});

describe('short quotes', () => {
  it('keeps a short sentence and clips a long page', () => {
    expect(shortQuote('  APY   is 4%.  ')).toBe('APY is 4%.');
    const long = `${'word '.repeat(30)}End of sentence. ${'tail '.repeat(80)}`;
    const quote = shortQuote(long);
    expect(quote.length).toBeLessThanOrEqual(400);
    expect(quote.endsWith('.')).toBe(true);
    expect(() => shortQuote('   ')).toThrow(/empty/i);
  });
});

describe('blocks', () => {
  it('treats a captcha as a captcha and a bare 403 as a block', () => {
    expect(blockReason(200, '', 'please solve the recaptcha')).toBe('captcha');
    expect(blockReason(403, '', 'forbidden')).toBe('blocked');
    expect(blockReason(200, '', 'APY 4.00%')).toBeNull();
    expect(blockReason(404, '', 'missing')).toBeNull();
  });
});
