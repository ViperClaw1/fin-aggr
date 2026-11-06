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

describe('review decisions', () => {
  const decisions = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261106190000_review_decisions.sql'),
    'utf8',
  );

  it('stores the login, the time, the reason, and the issue, and rejects a null reason', () => {
    expect(decisions).toContain('decided_by text');
    expect(decisions).toContain('decided_at timestamptz');
    expect(decisions).toContain('decision_reason text');
    expect(decisions).toContain('issue_url text');
    expect(decisions).toContain("decision_reason is not null and decision_reason <> ''");
    expect(decisions).toContain("decided_by ~ '^[A-Za-z0-9-]{1,39}$'");
  });
});
