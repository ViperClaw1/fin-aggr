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

// zod must not be in any first-load chunk (ADR-016 D3). Lint rules check syntax and keep missing new
// ways to pull it in (`.options` on a z.enum); this checks the bundle itself. The marker survives
// minification: zod passes it as a string to its class constructor.
const ZOD_MARKER = '$ZodType';
const ZOD_ALLOWED = new Set(['/dev/components']); // the stand renders schemas; 404 in production
const hasZod = (path) => readFileSync(join(APP, path), 'utf8').includes(ZOD_MARKER);

const rows = stats
  .map(({ route, firstLoadChunkPaths }) => ({
    route,
    kb: firstLoadChunkPaths.reduce((sum, p) => sum + size(p), 0) / 1024,
    zod: firstLoadChunkPaths.some(hasZod),
  }))
  .sort((a, b) => a.route.localeCompare(b.route, 'en-US'));

process.stdout.write(
  `First Load JS, KB gzip (AC-8 budget ${String(BUDGET_KB)} KB on ${BUDGET_ROUTE})\n`,
);
for (const { route, kb, zod } of rows) {
  const flag = `${kb > BUDGET_KB ? '  over budget' : ''}${zod ? '  zod' : ''}`;
  process.stdout.write(`${kb.toFixed(1).padStart(7)}  ${route}${flag}\n`);
}
// the stand must still carry zod, or the marker no longer matches and the check below is empty
if (!rows.some((r) => r.zod && ZOD_ALLOWED.has(r.route))) {
  process.stderr.write(`✖ no chunk contains ${ZOD_MARKER}: the zod check checks nothing\n`);
  process.exit(1);
}
const withZod = rows.filter((r) => r.zod && !ZOD_ALLOWED.has(r.route));
if (withZod.length > 0) {
  process.stderr.write(
    `✖ zod in the first load of ${withZod.map((r) => r.route).join(', ')} (ADR-016 D3)\n`,
  );
  process.exit(1);
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
