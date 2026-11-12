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

describe('par yields', () => {
  const yields = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261112130000_par_yields.sql'),
    'utf8',
  );

  it('stores the curve rate as text for readers and caps it at 20%', () => {
    expect(yields).toContain('rate rate not null check (rate <= 0.2)');
    expect(yields).toContain('rate::text');
    expect(yields).toContain('par_yields_text');
  });
});

describe('bank opt-out', () => {
  const optOut = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261111180000_source_opt_out.sql'),
    'utf8',
  );

  it('stores the request, the application, and the login on the source flag', () => {
    expect(optOut).toContain('opt_out_requested_at timestamptz');
    expect(optOut).toContain('opt_out_applied_at timestamptz');
    expect(optOut).toContain('opt_out_by text');
    expect(optOut).toContain('excluded = true');
    expect(optOut).toContain("opt_out_by ~ '^[A-Za-z0-9-]{1,39}$'");
  });
});
