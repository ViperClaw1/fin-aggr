import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATASET_DOMAINS } from '@fa/contracts';
import { describe, expect, it } from 'vitest';

describe('seed plan domains', () => {
  it('inserts a mock version for every contract domain', () => {
    const source = readFileSync(join(process.cwd(), 'supabase/scripts/seed-plan.mjs'), 'utf8');
    const block = /const DOMAINS = \[([\s\S]*?)\];/.exec(source)?.[1] ?? '';
    const seeded = [...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(seeded).toEqual([...DATASET_DOMAINS]);
    expect(source).toContain('values ($1, $2, true, false)');
    expect(source).toContain('insertInstitutions(client, ids.products, set.institutions)');
  });
});
