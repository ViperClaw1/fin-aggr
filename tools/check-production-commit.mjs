/* global fetch, URL, setTimeout */
// After a Vercel deploy, fail unless production HTML stamps this commit.
// Usage: node tools/check-production-commit.mjs <origin> <40-char sha>
// Polls, because the deploy finishes after CI has already started.
// A Vercel status of "Skipped - Not affected" is success when the live stamp
// is an ancestor: the web app did not change, so Vercel does not deploy.
import { execFileSync } from 'node:child_process';
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

/** Vercel skipped the build because the deployed project did not change. */
function vercelSkippedUnaffected(payload) {
  const statuses = Array.isArray(payload?.statuses) ? payload.statuses : [];
  return statuses.some(
    (status) =>
      status?.state === 'success' &&
      typeof status.context === 'string' &&
      status.context.startsWith('Vercel') &&
      typeof status.description === 'string' &&
      status.description.includes('Not affected'),
  );
}

async function deploySkipped(sha) {
  const repo = process.env['GITHUB_REPOSITORY'];
  if (repo === undefined || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return false;
  const response = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/status`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'fa-production-commit' },
  });
  if (!response.ok) return false;
  return vercelSkippedUnaffected(await response.json());
}

function hasCommit(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** True when production is already this commit or an older commit on the same history. */
function servesAncestor(live, expected) {
  if (!/^[0-9a-f]{40}$/.test(live)) return false;
  if (!hasCommit(live)) {
    try {
      execFileSync('git', ['fetch', '--depth=50', 'origin', live], { stdio: 'ignore' });
    } catch {
      return false;
    }
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', live, expected], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
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
    if (got !== null && (await deploySkipped(expected)) && servesAncestor(got, expected)) {
      process.stdout.write(
        `production ${origin} serves ${got}; Vercel skipped ${expected} because the web app did not change\n`,
      );
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
