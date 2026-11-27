// API role grants on a live database (migration 20261127120000). Skips unless
// SUPABASE_DB_URL_STAGING is set, so `pnpm test` stays offline. Read-only: catalog queries only.
import { describe, expect, it } from 'vitest';
import { withClient } from '../db';

const url = process.env['SUPABASE_DB_URL_STAGING']?.trim() ?? '';

const RELATIONS = `
  select c.relname as name, c.relkind as kind, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v')`;

interface Relation {
  name: string;
  kind: string;
  rls: boolean;
}

async function missing(check: string, roles: readonly string[], kinds: string): Promise<string[]> {
  return withClient(url, async (sql) => {
    const { rows } = await sql.query(
      `select r.name || ':' || role.name as gap
       from (${RELATIONS}) r cross join unnest($1::text[]) as role(name)
       where position(r.kind in $2) > 0
         and not has_table_privilege(role.name, 'public.' || quote_ident(r.name), $3)
       order by 1`,
      [roles, kinds, check],
    );
    return rows.map((row) => (row as { gap: string }).gap);
  });
}

describe.skipIf(url === '')('staging API role grants', () => {
  it('keeps RLS on every public table', async () => {
    const rows = await withClient(url, async (sql) => (await sql.query(RELATIONS)).rows);
    const open = (rows as unknown as Relation[]).filter((row) => row.kind !== 'v' && !row.rls);
    expect(open.map((row) => row.name)).toEqual([]);
  });

  it('lets the secret key read and write every public table', async () => {
    for (const check of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(await missing(check, ['service_role'], 'rp')).toEqual([]);
    }
  });

  it('lets anon and authenticated select every public table and view', async () => {
    expect(await missing('SELECT', ['anon', 'authenticated'], 'rpv')).toEqual([]);
  });
});
