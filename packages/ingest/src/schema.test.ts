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

describe('national deposit rates', () => {
  const rates = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261113120100_national_deposit_rates.sql'),
    'utf8',
  );

  it('stores the FRED percent as a rate on the reference version and caps it at 20%', () => {
    expect(rates).toContain('rate rate not null check (rate <= 0.2)');
    expect(rates).toContain('rate::text');
    expect(rates).toContain('national_deposit_rates_text');
    expect(rates).not.toContain("publish_domain('reference'");
  });
});

describe('institution regulator', () => {
  const regulator = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261113120000_institution_regulator_ust.sql'),
    'utf8',
  );

  it('allows the Treasury issuer and does not add an insurance limit for it', () => {
    expect(regulator).toContain("check (regulator in ('FDIC', 'NCUA', 'UST'))");
    expect(regulator).not.toContain('alter table insurance_limits');
  });
});

describe('bank deposits', () => {
  const deposits = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261112160000_bank_deposits.sql'),
    'utf8',
  );

  it('adds a nullable thousands column so a missing call report is not stored as zero', () => {
    expect(deposits).toContain('add column if not exists deposits_usd_thousands bigint');
    expect(deposits).toContain('deposits_usd_thousands is null or deposits_usd_thousands >= 0');
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
