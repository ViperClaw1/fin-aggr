// Lints every *.canary.ts(x) and fails unless each one trips the rule named in its header:
//   // expect: <ruleId> [message substring]
// Files with only a `// depcruise:` header belong to tools/depcruise-canaries.mjs.
// A canary that passes means its rule is broken (spec §7.5, AC-10).
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { ESLint } from 'eslint';

process.env.LINT_CANARIES = '1';

const EXPECT = /^\/\/ expect: (\S+)(?: (.+))?$/m;
const DEPCRUISE = /^\/\/ depcruise: \S+$/m;
const eslint = new ESLint();
const results = await eslint.lintFiles(['**/*.canary.ts', '**/*.canary.tsx']);

const failures = [];
let checked = 0;
for (const { filePath, messages } of results) {
  const file = relative(process.cwd(), filePath);
  const source = readFileSync(filePath, 'utf8');
  const header = EXPECT.exec(source);
  if (!header) {
    if (!DEPCRUISE.test(source)) failures.push(`${file}: needs "// expect: <ruleId> [text]"`);
    continue;
  }
  checked += 1;
  const [, ruleId, text] = header;
  const hit = messages.some((m) => m.ruleId === ruleId && (!text || m.message.includes(text)));
  if (!hit) {
    const got =
      messages.map((m) => `${m.ruleId ?? 'fatal'}: ${m.message}`).join('; ') || 'no errors';
    failures.push(`${file}: expected ${ruleId}${text ? ` "${text}"` : ''}, got ${got}`);
  }
}

if (checked === 0) failures.push('no ESLint canaries found');
for (const f of failures) process.stderr.write(`✖ ${f}\n`);
process.stdout.write(
  `${checked - failures.length}/${checked} ESLint canaries tripped their rule\n`,
);
process.exitCode = failures.length > 0 ? 1 : 0;
