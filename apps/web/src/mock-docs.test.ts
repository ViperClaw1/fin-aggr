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

async function pageText(bytes: Buffer, pageNumber: number): Promise<string> {
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    useWasm: false,
    verbosity: 0,
  }).promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    return content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replaceAll(/\s+/g, ' ')
      .trim();
  } finally {
    await pdf.cleanup();
  }
}

const built = mkdtempSync(join(tmpdir(), 'fa-docs-'));
const again = mkdtempSync(join(tmpdir(), 'fa-docs-'));

afterAll(() => {
  rmSync(built, { recursive: true, force: true });
  rmSync(again, { recursive: true, force: true });
});

describe('synthetic documents', () => {
  beforeAll(() => {
    build(built, String(DEFAULT_SEED));
    build(again, String(DEFAULT_SEED));
  });

  it('uses the same default seed as the app and the generator', () => {
    expect(readEnv({}).seed).toBe(DEFAULT_SEED);
    const dir = mkdtempSync(join(tmpdir(), 'fa-docs-'));
    try {
      build(dir, null);
      expect(readFileSync(join(dir, '.seed'), 'utf8')).toBe(String(DEFAULT_SEED));
      expect(generateFixtures(DEFAULT_SEED).documents.map((doc) => doc.id)).toEqual(
        Array.from({ length: 8 }, (_, i) => `doc_${String(i + 1).padStart(2, '0')}`),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
    for (const fact of fixtures.facts) {
      const doc = fixtures.documents.find((item) => item.id === fact.documentId);
      expect(doc).toBeDefined();
      if (doc === undefined) continue;
      expect(fact.page).toBeLessThanOrEqual(doc.pages);
      const text = await pageText(readFileSync(join(built, `${doc.id}.pdf`)), fact.page);
      const quote = fact.quote.replaceAll(/\s+/g, ' ').trim();
      expect(text).toContain(quote);
    }
  });
});
