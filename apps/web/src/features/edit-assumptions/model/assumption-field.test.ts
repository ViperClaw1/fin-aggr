import { describe, expect, it } from 'vitest';
import { assumptionField } from './assumption-field';

describe('assumptionField', () => {
  it('opens the deposit amount for the default scenario and the city rate for the city assumption', () => {
    expect(assumptionField('default_scenario')).toBe('principal');
    expect(assumptionField('city_marginal_rate')).toBe('cityMarginalRate');
  });

  it('does not open a field for the tax year or an assumption the form cannot change', () => {
    expect(assumptionField('default_tax_year')).toBeNull();
    expect(assumptionField('penalty_reduces_taxable_interest')).toBeNull();
    expect(assumptionField('unknown')).toBeNull();
  });
});
