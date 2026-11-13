import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRegisterShape } from './live';
import {
  REGISTER_AGENCIES,
  documentsUrl,
  parseRegisterDocuments,
  readRegisterPage,
  registerEnvelopeProblems,
} from './documents';

const recorded = readFileSync(join(import.meta.dirname, 'documents.snapshot.json'), 'utf8');

describe('Federal Register documents', () => {
  it('keeps number, date, title, and url from the saved response', () => {
    expect(recorded).not.toContain('abstract');
    expect(recorded).not.toContain('excerpts');
    const notices = parseRegisterDocuments(JSON.parse(recorded) as unknown);
    expect(notices).toEqual([
      {
        documentNumber: '2026-22495',
        publicationDate: '2026-11-04',
        title: 'Large-Bank Deposit Insurance Determination Modernization',
        url: 'https://www.federalregister.gov/documents/2026/11/04/2026-22495/large-bank-deposit-insurance-determination-modernization',
      },
    ]);
    expect(Object.keys(notices[0] ?? {})).toEqual([
      'documentNumber',
      'publicationDate',
      'title',
      'url',
    ]);
    expect(registerEnvelopeProblems(JSON.parse(recorded) as unknown)).toEqual([]);
  });

  it('treats an empty day as a successful parse', () => {
    expect(parseRegisterDocuments({ count: 0, results: [] })).toEqual([]);
    expect(registerEnvelopeProblems({ results: [] })).toEqual([]);
  });

  it('rejects a page that is not a results envelope', () => {
    expect(() => parseRegisterDocuments({ count: 1 })).toThrow(/fr_envelope/);
    expect(registerEnvelopeProblems({ results: 'no' })).toEqual(['results']);
    expect(registerEnvelopeProblems(null)).toEqual(['body']);
  });

  it('keeps a correction number and skips one bad row', () => {
    const good = {
      document_number: 'C1-2025-19864',
      publication_date: '2026-02-25',
      title: 'Correction',
      html_url: 'https://www.federalregister.gov/documents/2026/02/25/C1-2025-19864/correction',
    };
    const bad = { document_number: '2026-1', title: 'Missing date' };
    const notices = parseRegisterDocuments(
      { results: [good, bad] },
      'consumer-financial-protection-bureau',
    );
    expect(notices.map((notice) => notice.documentNumber)).toEqual(['C1-2025-19864']);
  });

  it('fails when more than half the rows are invalid', () => {
    const bad = {
      document_number: 'not-a-number',
      publication_date: '2026-02-25',
      title: 'No',
      html_url: 'https://www.federalregister.gov/x',
    };
    expect(() =>
      parseRegisterDocuments({ results: [bad, bad] }, 'consumer-financial-protection-bureau'),
    ).toThrow(/fr_invalid_number/);
  });

  it('rejects an HTML body as json_invalid for that agency', () => {
    expect(() => readRegisterPage('<html></html>', 'internal-revenue-service')).toThrow(
      /json_invalid/,
    );
  });

  it('asks the four agencies by their documented slugs', () => {
    expect(REGISTER_AGENCIES).toEqual([
      'federal-deposit-insurance-corporation',
      'national-credit-union-administration',
      'consumer-financial-protection-bureau',
      'internal-revenue-service',
    ]);
    const url = new URL(documentsUrl('internal-revenue-service', 20));
    expect(url.searchParams.getAll('conditions[agencies][]')).toEqual(['internal-revenue-service']);
    expect(url.searchParams.get('per_page')).toBe('20');
    expect(url.searchParams.get('order')).toBe('newest');
  });

  it('checks twenty IRS documents without printing the title', async () => {
    const urls: string[] = [];
    const ok = await checkRegisterShape((input) => {
      if (typeof input !== 'string') throw new Error('url');
      urls.push(input);
      return Promise.resolve(new Response(recorded, { status: 200 }));
    });
    expect(ok).toBe('federal register shape ok');
    expect(urls[0]).toContain('internal-revenue-service');
    expect(urls[0]).toContain('per_page=20');
    const empty = await checkRegisterShape(() =>
      Promise.resolve(new Response('{"results":[]}', { status: 200 })),
    );
    expect(empty).toBe('federal register shape ok');
    const html = await checkRegisterShape(() =>
      Promise.resolve(new Response('<html></html>', { status: 200 })),
    );
    expect(html).toBe('federal register shape json_invalid');
    const down = await checkRegisterShape(() =>
      Promise.resolve(new Response('no', { status: 503 })),
    );
    expect(down).toBe('federal register shape http 503');
  });
});
