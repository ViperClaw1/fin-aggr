import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { insuranceLimitQuotes, limitQuote } from './limit';

const root = join(import.meta.dirname, '../../../..');

describe('insurance limit quotes', () => {
  it('reads the standard limit sentence from the saved sections', () => {
    const quotes = insuranceLimitQuotes();
    expect(quotes.map((quote) => quote.regulator)).toEqual(['FDIC', 'NCUA']);
    expect(quotes.map((quote) => quote.section)).toEqual(['330.1(o)', '745.1(e)']);
    expect(quotes.map((quote) => quote.amountText)).toEqual(['$250,000', '$250,000']);
    expect(quotes[0]?.quote).toContain('SMDIA');
    expect(quotes[1]?.quote).toContain('SMSIA');
    for (const quote of quotes) {
      expect(quote.quote).toContain(quote.amountText);
      expect(quote.quote.length).toBeLessThanOrEqual(400);
      expect(quote.quote).not.toContain('<');
      expect(quote.verification).toBe('unverified');
    }
  });

  it('does not invent a quote when the section has no dollar figure', () => {
    expect(() => limitQuote('<p data-title="330.1(o)">No figure here.</p>')).toThrow(
      'insurance quote has no amount',
    );
  });

  it('leaves the fixture limit unverified', () => {
    const fixtures = readFileSync(join(root, 'packages/fixtures/src/reference.ts'), 'utf8');
    expect(fixtures).toContain('dollars(250000)');
    expect(fixtures).toContain("verification: { status: 'unverified' }");
    const quotes = insuranceLimitQuotes();
    expect(quotes.every((quote) => !quote.sourceUrl.includes('/part-328'))).toBe(true);
    const source = readFileSync(join(import.meta.dirname, 'limit.ts'), 'utf8');
    expect(source).not.toContain('@fa/fixtures');
  });
});
