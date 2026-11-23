import { describe, expect, it } from 'vitest';
import { taxFrom } from './supabase-rows';

const source = { sourceId: 'state-revenue-nc', isMock: false };

describe('taxFrom', () => {
  it('keeps a state row source as that state provenance', () => {
    const tables = taxFrom(
      { tax_year: 2026, provenance: {}, states_provenance: null },
      [],
      [{ state_code: 'NC', assumed_marginal_rate: '0.0399', provenance: source }],
    ) as { states: Record<string, unknown> };
    expect(tables.states['NC']).toEqual({ assumedMarginalRate: '0.0399', provenance: source });
  });

  it('leaves the provenance out of a state row without one', () => {
    const tables = taxFrom(
      { tax_year: 2026, provenance: {}, states_provenance: null },
      [],
      [{ state_code: 'CA', assumed_marginal_rate: '0.06', provenance: null }],
    ) as { states: Record<string, unknown> };
    expect(tables.states['CA']).toEqual({ assumedMarginalRate: '0.06' });
  });
});
