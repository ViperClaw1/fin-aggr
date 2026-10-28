// First Load JS per route, gzip, from Next's own list of first-load chunks
// (apps/web/.next/diagnostics/route-bundle-stats.json, written by `next build`). ADR-016.
// Reports every route and fails above the AC-8 budget on the compare route (ADR-016 D7). All
// categories share one route and one bundle; /compare/cd has the most rows.
import process from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const APP = 'apps/web';
const BUDGET_KB = 200; // AC-8: /compare/cd, gzip, without the PDF module
const BUDGET_ROUTE = '/compare/[category]';

const STATS = join(APP, '.next/diagnostics/route-bundle-stats.json');
if (!existsSync(STATS)) {
  process.stderr.write(
    `✖ ${STATS} not found: run \`pnpm build\` first, or Next output changed (see ADR-016)\n`,
  );
  process.exit(1);
}
const stats = JSON.parse(readFileSync(STATS, 'utf8'));
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
  `First Load JS, KB gzip (AC-8 budget ${String(BUDGET_KB)} KB on ${BUDGET_ROUTE})\n`,
);
for (const { route, kb } of rows) {
  const flag = kb > BUDGET_KB ? '  over budget' : '';
  process.stdout.write(`${kb.toFixed(1).padStart(7)}  ${route}${flag}\n`);
}
const budgeted = rows.find((r) => r.route === BUDGET_ROUTE);
if (budgeted === undefined) {
  process.stderr.write(`✖ ${BUDGET_ROUTE} is missing from the build: the budget checks nothing\n`);
  process.exit(1);
}
if (budgeted.kb > BUDGET_KB) {
  process.stderr.write(`✖ ${BUDGET_ROUTE} is over the AC-8 budget\n`);
  process.exit(1);
}
