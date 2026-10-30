// Synthetic PDFs for the mock documents (ADR-018). Same seed as the app: NEXT_PUBLIC_FA_SEED,
// or 20261025, the default in env.ts and @fa/fixtures. A fixed CreationDate makes pdfkit's file id
// stable, so the same seed is the same bytes. If the files for this seed are already in the output
// directory, the script does nothing. Quote text that changes at the same seed is picked up only
// after the directory is deleted.
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import PDFDocument from 'pdfkit';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Same number as readEnv and @fa/fixtures DEFAULT_SEED. The PDF test fails if those drift.
const DEFAULT_SEED = 20261025;
const DOCUMENT_IDS = Array.from({ length: 8 }, (_, i) => `doc_${String(i + 1).padStart(2, '0')}`);
const TRANSFORM = '--experimental-transform-types';
const WATERMARK = 'SYNTHETIC DOCUMENT · NOT A REAL BANK AGREEMENT';
const FILLER =
  'This page is filler in a synthetic deposit agreement written for the FA prototype. It is not a bank document and it is not for financial decisions.';
const CREATED = new Date('2026-01-01T00:00:00.000Z');
const PAGE = { size: 'LETTER', margin: 72 };
const TEXT_WIDTH = 468;
const BOTTOM = 720;

function seedFromEnv() {
  const raw = process.env.NEXT_PUBLIC_FA_SEED?.trim();
  if (raw === undefined || raw === '') return DEFAULT_SEED;
  if (!/^\d{1,9}$/.test(raw)) {
    process.stderr.write(`NEXT_PUBLIC_FA_SEED must be a non-negative integer, got "${raw}"\n`);
    process.exit(1);
  }
  return Number(raw);
}

function outputDir() {
  const override = process.env.FA_DOCS_OUT?.trim();
  return override === undefined || override === ''
    ? join(ROOT, 'apps/web/public/mock-docs')
    : override;
}

function quotesOn(facts, documentId) {
  const byPage = new Map();
  for (const fact of facts) {
    if (fact.documentId !== documentId) continue;
    const list = byPage.get(fact.page) ?? [];
    list.push(fact.quote);
    byPage.set(fact.page, list);
  }
  return byPage;
}

function paint(doc, meta, byPage) {
  for (let page = 1; page <= meta.pages; page += 1) {
    const before = doc.bufferedPageRange().count;
    doc.addPage(PAGE);
    doc.fillColor('#b0b0b0').fontSize(9).text(WATERMARK, 72, 36, {
      width: TEXT_WIDTH,
      align: 'center',
      lineBreak: false,
    });
    doc.fillColor('#111111').fontSize(11);
    doc.y = 72;
    for (const quote of byPage.get(page) ?? []) {
      doc.text(quote, 72, doc.y, { width: TEXT_WIDTH });
      doc.moveDown(0.8);
      if (doc.bufferedPageRange().count !== before + 1) {
        throw new Error(`${meta.id} page ${String(page)}: a quote ran onto the next page`);
      }
    }
    const room = BOTTOM - doc.y;
    if (room > 24) {
      doc.text(`${FILLER}\n\n`.repeat(6), 72, doc.y, { width: TEXT_WIDTH, height: room });
    }
    if (doc.bufferedPageRange().count !== before + 1) {
      throw new Error(`${meta.id} page ${String(page)}: the page grew while filling it`);
    }
  }
}

/** The PDF bytes for one fixture document. Same inputs, same bytes. */
export function renderDocument(meta, facts) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      ...PAGE,
      autoFirstPage: false,
      bufferPages: true,
      info: {
        Title: meta.title,
        Author: 'FA',
        Creator: 'FA synthetic documents',
        Producer: 'FA synthetic documents',
        CreationDate: CREATED,
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.font('Helvetica');
      paint(doc, meta, quotesOn(facts, meta.id));
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function alreadyBuilt(dir, ids, seed) {
  const stamp = join(dir, '.seed');
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== String(seed)) return false;
  return ids.every((id) => existsSync(join(dir, `${id}.pdf`)));
}

async function main() {
  const seed = seedFromEnv();
  const dir = outputDir();
  if (alreadyBuilt(dir, DOCUMENT_IDS, seed)) {
    process.stdout.write(`mock-docs: seed ${String(seed)} already built\n`);
    return;
  }
  // Fixture sources use TypeScript parameter properties, which strip-only mode cannot load.
  if (!process.execArgv.includes(TRANSFORM)) {
    const child = spawnSync(
      process.execPath,
      [TRANSFORM, ...process.execArgv, process.argv[1], ...process.argv.slice(2)],
      { stdio: 'inherit', env: process.env },
    );
    process.exit(child.status ?? 1);
  }
  register(new globalThis.URL('./resolve-ts.mjs', import.meta.url));
  const { generateFixtures } = await import('@fa/fixtures');
  const { documents, facts } = generateFixtures(seed);
  mkdirSync(dir, { recursive: true });
  for (const doc of documents) {
    const bytes = await renderDocument(doc, facts);
    writeFileSync(join(dir, `${doc.id}.pdf`), bytes);
  }
  writeFileSync(join(dir, '.seed'), String(seed));
  const digest = createHash('sha256')
    .update(readFileSync(join(dir, 'doc_01.pdf')))
    .digest('hex')
    .slice(0, 12);
  process.stdout.write(
    `mock-docs: wrote ${String(documents.length)} pdfs for seed ${String(seed)} (${digest})\n`,
  );
}

const invoked =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}
