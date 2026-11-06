import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261106095910_initial_schema.sql'),
  'utf8',
);

describe('rate columns', () => {
  it('are read back as text', () => {
    const columns = [...sql.matchAll(/(\w+)\s+rate\s+not null/g)].map((match) => match[1] ?? '');
    expect(columns).toEqual(['apy', 'rate', 'assumed_marginal_rate']);
    for (const column of columns) {
      expect(sql).toContain(`${column}::text`);
    }
  });
});
