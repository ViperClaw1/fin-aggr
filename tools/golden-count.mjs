// AC-2: the engine has at least 20 golden cases, and every file with golden cases names its
// independent calculation. A golden case is a test titled 'golden: …' (it.each rows count once).
import process from 'node:process';
import { globSync, readFileSync } from 'node:fs';

const MIN = 20;
const TITLE = /\(\s*'golden: /g;
const SOURCE = /\/\/ independent calc: \S+/;

let total = 0;
const failures = [];
for (const file of globSync('packages/engine/src/**/*.test.ts')) {
  const text = readFileSync(file, 'utf8');
  const count = text.match(TITLE)?.length ?? 0;
  total += count;
  if (count > 0 && !SOURCE.test(text))
    failures.push(`${file}: golden cases without "// independent calc:"`);
}
if (total < MIN) failures.push(`${total} golden cases, AC-2 needs at least ${MIN}`);

for (const f of failures) process.stderr.write(`✖ ${f}\n`);
process.stdout.write(`${total} golden cases in packages/engine\n`);
process.exitCode = failures.length > 0 ? 1 : 0;
