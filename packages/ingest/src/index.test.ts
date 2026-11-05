import { describe, expect, it } from 'vitest';
import { DATASET_DOMAINS, type DatasetDomain, type IngestDb } from './index';

describe('dataset domains', () => {
  it('lists the versioned domains from ADR-019', () => {
    const domains: readonly DatasetDomain[] = DATASET_DOMAINS;
    expect(domains).toEqual([
      'institutions',
      'bank_metrics',
      'products',
      'treasury',
      'reference',
      'documents',
    ]);
  });

  it('keeps the supabase client type on this package', () => {
    const unused: IngestDb | null = null;
    expect(unused).toBeNull();
  });
});
