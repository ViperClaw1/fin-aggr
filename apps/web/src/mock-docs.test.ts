// The synthetic PDFs carry each fixture quote on fact.page (ADR-018). The script is what
// predev and prebuild run; this test builds into a temp directory so it does not touch public/.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { DEFAULT_SEED, generateFixtures } from '@fa/fixtures';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEnv } from '@/shared/config/env';

const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
).href;

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function build(dir: string, seed: string | null): string {
  const env = { ...process.env, FA_DOCS_OUT: dir };
  if (seed === null) delete env.NEXT_PUBLIC_FA_SEED;
  else env.NEXT_PUBLIC_FA_SEED = seed;
  return execFileSync(process.execPath, ['tools/build-docs.mjs'], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
}

function sha256(dir: string, id: string): string {
  return createHash('sha256')
    .update(readFileSync(join(dir, `${id}.pdf`)))
    .digest('hex');
}

/** One open per file. Returns the text of the pages that carry quotes. */
async function openQuotes(bytes: Buffer, pages: ReadonlySet<number>): Promise<Map<number, string>> {
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    useWasm: false,
    verbosity: 0,
  }).promise;
  try {
    const text = new Map<number, string>();
    for (const pageNumber of pages) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      text.set(
        pageNumber,
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replaceAll(/\s+/g, ' ')
          .trim(),
      );
    }
    return text;
  } finally {
    await pdf.cleanup();
  }
}

const built = mkdtempSync(join(tmpdir(), 'fa-docs-'));
const again = mkdtempSync(join(tmpdir(), 'fa-docs-'));
let defaultLog = '';

afterAll(() => {
  rmSync(built, { recursive: true, force: true });
  rmSync(again, { recursive: true, force: true });
});

describe('synthetic documents', () => {
  beforeAll(() => {
    defaultLog = build(built, null);
    build(again, String(DEFAULT_SEED));
  });

  it('uses the same default seed as the app and the generator', () => {
    expect(readEnv({}).seed).toBe(DEFAULT_SEED);
    expect(defaultLog).toContain(`seed ${String(DEFAULT_SEED)}`);
    expect(readFileSync(join(built, '.seed'), 'utf8')).toMatch(/^[a-f0-9]{64}$/);
    expect(generateFixtures(DEFAULT_SEED).documents.map((doc) => doc.id)).toEqual(
      Array.from({ length: 8 }, (_, i) => `doc_${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('writes the same bytes for the same seed and skips a second run', () => {
    const fixtures = generateFixtures(DEFAULT_SEED);
    for (const doc of fixtures.documents) {
      expect(sha256(built, doc.id)).toBe(sha256(again, doc.id));
    }
    const written = statSync(join(built, 'doc_01.pdf')).mtimeMs;
    const log = build(built, String(DEFAULT_SEED));
    expect(log).toContain('already built');
    expect(statSync(join(built, 'doc_01.pdf')).mtimeMs).toBe(written);
  });

  it('puts each quote on its fact page', async () => {
    const fixtures = generateFixtures(DEFAULT_SEED);
    expect(fixtures.documents).toHaveLength(8);
    for (const doc of fixtures.documents) {
      const facts = fixtures.facts.filter((fact) => fact.documentId === doc.id);
      expect(facts).toHaveLength(5);
      const text = await openQuotes(
        readFileSync(join(built, `${doc.id}.pdf`)),
        new Set(facts.map((fact) => fact.page)),
      );
      for (const fact of facts) {
        expect(fact.page).toBeLessThanOrEqual(doc.pages);
        const quote = fact.quote.replaceAll(/\s+/g, ' ').trim();
        expect(text.get(fact.page)).toContain(quote);
      }
    }
  });
});
