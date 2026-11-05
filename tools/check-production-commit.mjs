/* global fetch, URL, setTimeout */
// After a Vercel deploy, fail unless production HTML stamps this commit.
// Usage: node tools/check-production-commit.mjs <origin> <40-char sha>
// Polls, because the deploy finishes after CI has already started.
import process from 'node:process';

const TIMEOUT_MS = 15 * 60 * 1000;
const INTERVAL_MS = 15 * 1000;

/** Content of `<meta name="build">`, or null when the tag is absent. */
function readBuildSha(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/\bname=["']build["']/.test(tag)) continue;
    const content = /\bcontent=["']([^"']*)["']/.exec(tag);
    return content?.[1] ?? '';
  }
  return null;
}

async function readLive(origin) {
  const response = await fetch(new URL('/', origin));
  // DEMO_PASSWORD answers 401 with the same build stamp as the app (proxy.ts).
  if (!response.ok && response.status !== 401) {
    throw new Error(`GET / -> ${String(response.status)}`);
  }
  return readBuildSha(await response.text());
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const origin = process.argv[2];
const expected = process.argv[3];
if (
  origin === undefined ||
  !/^https?:\/\//.test(origin) ||
  !/^[0-9a-f]{40}$/.test(expected ?? '')
) {
  process.stderr.write('usage: node tools/check-production-commit.mjs <origin> <40-char sha>\n');
  process.exit(2);
}

const deadline = Date.now() + TIMEOUT_MS;
let last = 'missing';
while (Date.now() <= deadline) {
  try {
    const got = await readLive(origin);
    last = got ?? 'missing';
    if (got === expected) {
      process.stdout.write(`production ${origin} serves ${expected}\n`);
      process.exit(0);
    }
    process.stdout.write(`waiting: build meta is ${last}\n`);
  } catch (error) {
    last = error instanceof Error ? error.message : 'request failed';
    process.stdout.write(`waiting: ${last}\n`);
  }
  if (Date.now() + INTERVAL_MS > deadline) break;
  await sleep(INTERVAL_MS);
}
process.stderr.write(`production does not serve ${expected} (last: ${last})\n`);
process.exit(1);
