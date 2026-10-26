// Cruises the repo with canaries included and fails unless every canary with a
//   // depcruise: <rule name>
// header shows up in a violation of that rule (spec §7.5, AC-10).
import process from 'node:process';
import { globSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const HEADER = /^\/\/ depcruise: (\S+)$/m;
const bin = join(process.cwd(), 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');

const run = spawnSync(
  process.execPath,
  [bin, '--config', '.dependency-cruiser.mjs', '--output-type', 'json', 'apps', 'packages'],
  { env: { ...process.env, DC_CANARIES: '1' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
if (!run.stdout) {
  process.stderr.write(run.stderr);
  process.exit(1);
}
const { violations } = JSON.parse(run.stdout).summary;

const failures = [];
let checked = 0;
for (const file of globSync('{apps,packages}/**/*.canary.{ts,tsx}')) {
  const header = HEADER.exec(readFileSync(file, 'utf8'));
  if (!header) continue;
  checked += 1;
  const path = file.replaceAll('\\', '/');
  const rule = header[1];
  const hit = violations.some((v) => v.rule.name === rule && (v.from === path || v.to === path));
  if (!hit) failures.push(`${path}: expected ${rule}`);
}

if (checked === 0) failures.push('no depcruise canaries found');
for (const f of failures) process.stderr.write(`✖ ${f}\n`);
process.stdout.write(
  `${checked - failures.length}/${checked} depcruise canaries tripped their rule\n`,
);
process.exitCode = failures.length > 0 ? 1 : 0;
