import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkLiveShapes } from './live';

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
  it('prints one line per source and treats an eCFR change as success', async () => {
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
    ]);
  });
});
