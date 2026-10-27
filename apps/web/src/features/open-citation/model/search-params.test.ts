import { describe, expect, it } from 'vitest';
import { citationParsers, citationUrl, loadCitation } from './search-params';

const load = (query: string) => loadCitation(new URLSearchParams(query));

describe('citation URL state', () => {
  it('reads an open citation', () => {
    expect(load('doc=doc_ally_terms&page=2&q=90%20days')).toEqual({
      documentId: 'doc_ally_terms',
      page: 2,
      quote: '90 days',
    });
  });
  it('without doc the citation is closed, whatever page and q say', () => {
    expect(load('page=3&q=text')).toBeNull();
  });
  it.each([
    ['page=0', 1],
    ['page=10000', 1],
    ['page=2.5', 1],
    ['page=abc', 1],
    ['page=9999', 9999],
  ])('page: %s → %i', (query, page) => {
    expect(load(`doc=d1&${query}`)?.page).toBe(page);
  });
  it('an invalid document id closes the citation', () => {
    expect(load('doc=bad%20id')).toBeNull();
    expect(load(`doc=${'a'.repeat(65)}`)).toBeNull();
  });
  it('the quote is trimmed, 1..400 characters, and HTML stays text', () => {
    expect(load('doc=d1&q=%20%20')?.quote).toBeNull();
    expect(load(`doc=d1&q=${'x'.repeat(401)}`)?.quote).toBeNull();
    const html = new URLSearchParams({ doc: 'd1', q: '<img src=x onerror=alert(1)>' });
    expect(load(html.toString())?.quote).toBe('<img src=x onerror=alert(1)>');
  });
  it('round trips and the default page is left out', () => {
    const ref = { documentId: 'd1', page: 1, quote: 'early withdrawal' };
    const url = citationUrl('', ref);
    expect(url).toBe('?doc=d1&q=early+withdrawal');
    expect(load(url.slice(1))).toEqual(ref);
  });
  it('closing clears all three keys and keeps other parameters', () => {
    expect(citationUrl('/compare/cd?term=12&doc=d1&page=2&q=x', null)).toBe('/compare/cd?term=12');
  });
  it('opening pushes a history entry so Back closes the viewer', () => {
    expect(Object.values(citationParsers).map((p) => p.history)).toEqual(['push', 'push', 'push']);
  });
});
