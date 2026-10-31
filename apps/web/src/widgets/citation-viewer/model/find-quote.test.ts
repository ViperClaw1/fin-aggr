import { describe, expect, it } from 'vitest';
import { findQuote } from './find-quote';

const item = (str: string) => ({ str });

describe('findQuote', () => {
  it('finds a quote on one item', () => {
    expect(findQuote([item('Outgoing ACH transfers are limited.')], 'Outgoing ACH')).toEqual([0]);
  });

  it('joins a quote that wraps across items', () => {
    const items = [
      item('Outgoing ACH transfers are'),
      item('limited to $25,000 per business day.'),
    ];
    expect(findQuote(items, 'transfers are limited to $25,000')).toEqual([0, 1]);
  });

  it('ignores extra spaces and line breaks', () => {
    expect(findQuote([item('No   penalty\napplies.')], 'No penalty applies.')).toEqual([0]);
  });

  it('ignores case', () => {
    expect(findQuote([item('Variable rate')], 'variable rate')).toEqual([0]);
  });

  it('treats a soft hyphen and a ligature as the letters they stand for', () => {
    expect(findQuote([item('with\u00ADdrawal')], 'withdrawal')).toEqual([0]);
    expect(findQuote([item('the \uFB01rst day')], 'the first day')).toEqual([0]);
  });

  it('returns nothing when the quote is not on the page', () => {
    expect(findQuote([item('No penalty applies.')], 'monthly fee')).toEqual([]);
  });
});
