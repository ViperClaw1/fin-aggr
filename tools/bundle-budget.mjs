// First Load JS per route, gzip, from Next's own list of first-load chunks
// (apps/web/.next/diagnostics/route-bundle-stats.json, written by `next build`). ADR-016.
// Report only for now; it starts failing above the AC-8 budget once /compare/cd exists (ADR-016 D7).
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const APP = 'apps/web';
const BUDGET_KB = 200; // AC-8: /compare/cd, gzip, without the PDF module

const stats = JSON.parse(
  readFileSync(join(APP, '.next/diagnostics/route-bundle-stats.json'), 'utf8'),
);
const gz = new Map();
const size = (path) => {
  if (!gz.has(path)) gz.set(path, gzipSync(readFileSync(join(APP, path))).length);
  return gz.get(path);
};

const rows = stats
  .map(({ route, firstLoadChunkPaths }) => ({
    route,
    kb: firstLoadChunkPaths.reduce((sum, p) => sum + size(p), 0) / 1024,
  }))
  .sort((a, b) => a.route.localeCompare(b.route, 'en-US'));

process.stdout.write(
  `First Load JS, KB gzip (AC-8 budget ${String(BUDGET_KB)} KB on /compare/cd)\n`,
);
for (const { route, kb } of rows) {
  const flag = kb > BUDGET_KB ? '  over budget' : '';
  process.stdout.write(`${kb.toFixed(1).padStart(7)}  ${route}${flag}\n`);
}
