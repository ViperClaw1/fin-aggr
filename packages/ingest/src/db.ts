import { Client } from 'pg';
import type { Sql } from './decisions';

/** Session pooler and hosted Postgres need TLS. The URL is never logged. */
function clientFor(url: string): Client {
  const host = new URL(url).hostname;
  if (host === '127.0.0.1' || host === 'localhost') return new Client({ connectionString: url });
  return new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
}

export async function withClient<T>(url: string, run: (sql: Sql) => Promise<T>): Promise<T> {
  const client = clientFor(url);
  await client.connect();
  const sql: Sql = {
    query: (text, values) => client.query(text, values === undefined ? undefined : [...values]),
  };
  try {
    return await run(sql);
  } finally {
    await client.end();
  }
}

export function databaseUrl(env: NodeJS.ProcessEnv): string {
  const url = env['SUPABASE_DB_URL']?.trim() ?? '';
  if (url === '') throw new Error('SUPABASE_DB_URL is missing');
  return url;
}
