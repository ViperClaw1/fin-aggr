// Path-scoped agent rules have one source: .claude/rules/*.md (Claude Code, `paths:` frontmatter).
// This script writes the Cursor copies to .cursor/rules/*.mdc (`globs:` frontmatter).
// `node tools/sync-agent-rules.mjs` writes; `--check` fails when a copy is missing or stale.
import process from 'node:process';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const SRC = '.claude/rules';
const OUT = '.cursor/rules';
const check = process.argv.includes('--check');

/** Splits `---\nfrontmatter\n---\nbody`; returns the `paths:` list and the body. */
function parse(text, file) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) throw new Error(`${file}: no frontmatter`);
  const paths = [...m[1].matchAll(/^\s*-\s*"([^"]+)"\s*$/gm)].map((x) => x[1]);
  if (paths.length === 0) throw new Error(`${file}: no paths in frontmatter`);
  return { paths, body: m[2].trimStart() };
}

function render(file, { paths, body }) {
  const title = /^#\s+(.+)$/m.exec(body)?.[1] ?? basename(file, '.md');
  return [
    '---',
    `description: ${title}. Path-scoped project rules.`,
    `globs: ${paths.join(',')}`,
    'alwaysApply: false',
    '---',
    '',
    `<!-- Generated from ${SRC}/${file} by tools/sync-agent-rules.mjs. Edit the source, then run pnpm rules:sync. -->`,
    '',
    body,
  ].join('\n');
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const stale = [];
for (const file of readdirSync(SRC)
  .filter((f) => f.endsWith('.md'))
  .sort()) {
  const want = render(file, parse(readFileSync(join(SRC, file), 'utf8'), file));
  const target = join(OUT, `${basename(file, '.md')}.mdc`);
  const have = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (have === want) continue;
  if (check) stale.push(target);
  else writeFileSync(target, want, 'utf8');
}
if (stale.length > 0) {
  process.stderr.write(
    `Cursor rules out of date with ${SRC}: ${stale.join(', ')}\nRun: pnpm rules:sync\n`,
  );
  process.exit(1);
}
