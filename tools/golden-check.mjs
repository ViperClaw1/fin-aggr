// Runs every packages/engine/golden/<name>.py and fails unless its JSON output equals
// <name>.json, the file the golden tests read as EXPECTED. Catches a constant edited by hand.
//   node tools/golden-check.mjs           check
//   node tools/golden-check.mjs --write   regenerate the JSON from the scripts
// Python comes from $PYTHON, else the first of python3, python, `py -3` (Windows), run isolated (-I).
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const CANDIDATES = [['python3'], ['python'], ['py', '-3']];
const [python, ...pythonArgs] = process.env.PYTHON
  ? [process.env.PYTHON]
  : (CANDIDATES.find(([cmd, ...args]) => spawnSync(cmd, [...args, '--version']).status === 0) ??
    CANDIDATES[0]);
const write = process.argv.includes('--write');
const scripts = globSync('packages/engine/golden/*.py');
const failures = [];

for (const script of scripts) {
  const json = script.replace(/\.py$/, '.json');
  const run = spawnSync(python, [...pythonArgs, '-I', script], { encoding: 'utf8' });
  if (run.status !== 0) {
    failures.push(`${script}: ${run.error?.message ?? run.stderr.trim()}`);
    continue;
  }
  const actual = JSON.parse(run.stdout);
  if (write) writeFileSync(json, `${JSON.stringify(actual, null, 2)}\n`);
  else if (!isDeepStrictEqual(actual, JSON.parse(readFileSync(json, 'utf8'))))
    failures.push(`${json}: differs from the output of ${script}`);
}

if (scripts.length === 0) failures.push('no golden scripts found');
for (const f of failures) process.stderr.write(`✖ ${f}\n`);
process.stdout.write(
  `${scripts.length - failures.length}/${scripts.length} golden scripts ${write ? 'written' : 'match'}\n`,
);
process.exitCode = failures.length > 0 ? 1 : 0;
