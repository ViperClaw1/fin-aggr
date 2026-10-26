// Lints every *.canary.ts(x) and fails unless each one trips the rule named in its first line:
//   // expect: <ruleId> [message substring]
// A canary that passes means its rule is broken (spec §7.5, AC-10).
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { ESLint } from 'eslint';

process.env.LINT_CANARIES = '1';

const HEADER = /^\/\/ expect: (\S+)(?: (.+))?$/;
const eslint = new ESLint();
const results = await eslint.lintFiles(['**/*.canary.ts', '**/*.canary.tsx']);

const failures = [];
for (const { filePath, messages } of results) {
  const file = relative(process.cwd(), filePath);
  const header = HEADER.exec(readFileSync(filePath, 'utf8').split(/\r?\n/, 1)[0] ?? '');
  if (!header) {
    failures.push(`${file}: first line must be "// expect: <ruleId> [message substring]"`);
    continue;
  }
  const [, ruleId, text] = header;
  const hit = messages.some((m) => m.ruleId === ruleId && (!text || m.message.includes(text)));
  if (!hit) {
    const got =
      messages.map((m) => `${m.ruleId ?? 'fatal'}: ${m.message}`).join('; ') || 'no errors';
    failures.push(`${file}: expected ${ruleId}${text ? ` "${text}"` : ''}, got ${got}`);
  }
}

if (results.length === 0) failures.push('no canaries found');
for (const f of failures) process.stderr.write(`✖ ${f}\n`);
process.stdout.write(
  `${results.length - failures.length}/${results.length} canaries tripped their rule\n`,
);
process.exitCode = failures.length > 0 ? 1 : 0;
