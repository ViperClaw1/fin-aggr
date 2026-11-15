import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bank products domain', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20261115160000_bank_products_domain.sql'),
    'utf8',
  );

  it('adds bank_products without removing the domains already in the check', () => {
    for (const domain of [
      'institutions',
      'bank_metrics',
      'products',
      'treasury',
      'reference',
      'documents',
      'par_yields',
      'national_rates',
      'bank_products',
    ]) {
      expect(sql).toContain(`'${domain}'`);
    }
    expect(sql).toContain("version_domain not in ('products', 'bank_products')");
    expect(sql).toContain('bank_confirmations');
    expect(sql).toContain("verified_by = 'human'");
    expect(sql).not.toContain('create policy');
  });
});
