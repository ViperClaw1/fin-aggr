import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkRegisterShape } from './live';
import {
  REGISTER_AGENCIES,
  documentsUrl,
  parseRegisterDocuments,
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

  it('rejects a result that is missing a published field', () => {
    expect(() => parseRegisterDocuments({ results: [{ document_number: '2026-1' }] })).toThrow(
      'federal register invalid',
    );
    expect(registerEnvelopeProblems({ results: [{ document_number: '2026-1' }] })).toEqual([
      'publication_date',
      'title',
      'html_url',
    ]);
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

  it('checks one live document without printing the title', async () => {
    const ok = await checkRegisterShape(() =>
      Promise.resolve(new Response(recorded, { status: 200 })),
    );
    expect(ok).toBe('federal register shape ok');
    const empty = await checkRegisterShape(() =>
      Promise.resolve(new Response('{"results":[]}', { status: 200 })),
    );
    expect(empty).toBe('federal register shape ok');
    const down = await checkRegisterShape(() =>
      Promise.resolve(new Response('no', { status: 503 })),
    );
    expect(down).toBe('federal register shape http 503');
  });
});
