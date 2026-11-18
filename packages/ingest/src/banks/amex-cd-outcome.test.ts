import { describe, expect, it } from 'vitest';
import { amexCdPageOutcome } from './amex-cd-watch';

describe('amex-cd-page outcome', () => {
  it('holds a captcha night with code captcha and one request, instead of failing', () => {
    expect(amexCdPageOutcome({ kind: 'manual', reason: 'captcha' })).toEqual({
      kind: 'held',
      code: 'captcha',
      requestCount: 1,
    });
  });

  it('holds outside the window without counting a request', () => {
    expect(amexCdPageOutcome({ kind: 'outside_window' })).toEqual({
      kind: 'held',
      code: 'outside_window',
      requestCount: 0,
    });
  });

  it('passes the page text through when the request succeeded', () => {
    const body = new TextEncoder().encode('<p>hi</p>');
    expect(amexCdPageOutcome({ kind: 'ok', url: 'u', body, status: 200 })).toEqual({
      kind: 'text',
      text: '<p>hi</p>',
    });
  });
});
