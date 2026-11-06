// pnpm db:seed --target local|staging|prod [--dry-run] [--confirm prod]
// One transaction. prod writes nothing unless --confirm prod. dry-run only prints counts.
import { register } from 'node:module';
import process from 'node:process';
import pg from 'pg';
import { endpointOf, loadLocalEnv } from './load-env.mjs';

loadLocalEnv();

const LOCAL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

register(new globalThis.URL('../../tools/resolve-ts.mjs', import.meta.url));
const { DEFAULT_SEED, generateFixtures } = await import('@fa/fixtures');
const { counts, loadFixtures } = await import('./seed-plan.mjs');

function flag(name) {
  return process.argv.includes(name);
}

function targetOf() {
  const index = process.argv.indexOf('--target');
  const target = index === -1 ? undefined : process.argv[index + 1];
  if (target !== 'local' && target !== 'staging' && target !== 'prod') {
    process.stderr.write(
      'usage: pnpm db:seed --target local|staging|prod [--dry-run] [--confirm prod]\n',
    );
    process.exit(2);
  }
  return target;
}

function sslOf(url) {
  const host = new globalThis.URL(url).hostname;
  if (host === '127.0.0.1' || host === 'localhost') return {};
  return { ssl: { rejectUnauthorized: false } };
}

function databaseUrl(target) {
  if (target === 'local') return process.env.SUPABASE_DB_URL?.trim() || LOCAL;
  const name = target === 'staging' ? 'SUPABASE_DB_URL_STAGING' : 'SUPABASE_DB_URL_PROD';
  const url = process.env[name]?.trim();
  if (url === undefined || url === '') {
    process.stderr.write(`${name} is empty\n`);
    process.exit(1);
  }
  return url;
}

const target = targetOf();
const set = generateFixtures(DEFAULT_SEED);
const plan = counts(set);
process.stdout.write(`seed ${String(DEFAULT_SEED)} target ${target} ${JSON.stringify(plan)}\n`);

if (flag('--dry-run')) process.exit(0);
if (target === 'prod' && !flag('--confirm')) {
  process.stderr.write('prod needs --confirm prod\n');
  process.exit(2);
}
if (target === 'prod' && process.argv[process.argv.indexOf('--confirm') + 1] !== 'prod') {
  process.stderr.write('prod needs --confirm prod\n');
  process.exit(2);
}

const url = databaseUrl(target);
process.stderr.write(`connecting ${endpointOf(url)}\n`);
const client = new pg.Client({ connectionString: url, ...sslOf(url) });
await client.connect();
try {
  await client.query('begin');
  await loadFixtures(client, set);
  await client.query('commit');
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  await client.end();
}
process.stdout.write('seed committed\n');
