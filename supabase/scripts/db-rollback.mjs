// pnpm db:rollback --target local|staging|prod <domain> <version>
// Points current at a version still inside 30 days. Does not delete it (ADR-019).
import process from 'node:process';
import pg from 'pg';
import { endpointOf, loadLocalEnv } from './load-env.mjs';

loadLocalEnv();

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const DOMAINS = new Set([
  'institutions',
  'bank_metrics',
  'products',
  'treasury',
  'reference',
  'documents',
]);

function arg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const target = arg('--target');
const domain = process.argv.at(-2);
const version = process.argv.at(-1);
if (
  (target !== 'local' && target !== 'staging' && target !== 'prod') ||
  !DOMAINS.has(domain ?? '')
) {
  process.stderr.write('usage: pnpm db:rollback --target local|staging|prod <domain> <version>\n');
  process.exit(2);
}
if (!/^\d+$/.test(version ?? '')) {
  process.stderr.write('version must be an integer\n');
  process.exit(2);
}

function databaseUrl() {
  if (target === 'local') return process.env.SUPABASE_DB_URL?.trim() || LOCAL;
  const name = target === 'staging' ? 'SUPABASE_DB_URL_STAGING' : 'SUPABASE_DB_URL_PROD';
  const url = process.env[name]?.trim();
  if (url === undefined || url === '') {
    process.stderr.write(`${name} is empty\n`);
    process.exit(1);
  }
  return url;
}

const url = databaseUrl();
process.stderr.write(`connecting ${endpointOf(url)}\n`);
const host = new globalThis.URL(url).hostname;
const client = new pg.Client({
  connectionString: url,
  ...(host === '127.0.0.1' || host === 'localhost' ? {} : { ssl: { rejectUnauthorized: false } }),
});
await client.connect();
try {
  await client.query('select rollback_domain($1, $2)', [domain, version]);
} finally {
  await client.end();
}
process.stdout.write(`rolled ${domain} back to ${version}\n`);
