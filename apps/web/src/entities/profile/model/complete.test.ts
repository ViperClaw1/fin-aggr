import { Cents, Rate, type ProfileDraft } from '@fa/contracts';
import { toEligibilityContext } from '@fa/engine';
import { describe, expect, it } from 'vitest';
import { defaultAssumptions, missingFields, toCompleteProfile, toEngineProfile } from './complete';

const REQUIRED: ProfileDraft = {
  filingStatus: 'single',
  stateCode: 'CA',
  taxableIncome: Cents.parse(8000000),
  residency: 'us_citizen',
};

describe('toCompleteProfile', () => {
  it('is null until all four required fields are present', () => {
    for (const field of Object.keys(REQUIRED) as (keyof ProfileDraft)[]) {
      const rest = Object.fromEntries(Object.entries(REQUIRED).filter(([k]) => k !== field));
      expect(toCompleteProfile(rest)).toBeNull();
    }
  });
  it('fills the defaults: tax year 2026, no city rate, no age, $10,000 for 12 months', () => {
    expect(toCompleteProfile(REQUIRED)).toEqual({
      ...REQUIRED,
      version: 1,
      taxYear: 2026,
      cityMarginalRate: null,
      age: null,
      scenario: { principal: 1000000, holdingMonths: 12 },
    });
  });
  it('keeps what the user entered, including half a scenario', () => {
    const p = toCompleteProfile({
      ...REQUIRED,
      age: 40,
      cityMarginalRate: Rate.parse('0.03'),
      scenario: { holdingMonths: 6 },
    });
    expect([p?.age, p?.cityMarginalRate, p?.scenario]).toEqual([
      40,
      '0.03',
      { principal: 1000000, holdingMonths: 6 },
    ]);
  });
  it('an explicit undefined does not erase a default', () => {
    expect(toCompleteProfile({ ...REQUIRED, age: undefined })?.age).toBeNull();
  });
  it('calculates a year without tax tables (an imported 2025) with 2026', () => {
    expect(toCompleteProfile({ ...REQUIRED, taxYear: 2025 })?.taxYear).toBe(2026);
  });
});

describe('missingFields and defaultAssumptions', () => {
  it('lists the missing required fields in a fixed order', () => {
    expect(missingFields({ stateCode: 'CA' })).toEqual([
      'filingStatus',
      'taxableIncome',
      'residency',
    ]);
  });
  it('names the default scenario as editable and the tax year as not editable', () => {
    expect(defaultAssumptions({})).toEqual([
      {
        id: 'default_scenario',
        text: 'Scenario: $10,000.00 for 12 months until you change it.',
        editable: true,
      },
      { id: 'default_tax_year', text: 'Tax year 2026.', editable: false },
    ]);
  });
  it('says when the profile year has no tables', () => {
    const draft = { taxYear: 2025, scenario: { principal: Cents.parse(5), holdingMonths: 3 } };
    expect(defaultAssumptions(draft)).toEqual([
      {
        id: 'default_tax_year',
        text: 'Tax year 2026 (2025 tables not available).',
        editable: false,
      },
    ]);
  });
  it('has no assumptions once the scenario and tax year are set', () => {
    const draft = { taxYear: 2026, scenario: { principal: Cents.parse(5), holdingMonths: 3 } };
    expect(defaultAssumptions(draft)).toEqual([]);
  });
});

describe('toEngineProfile', () => {
  it('passes only the eligibility fields, with the default deposit', () => {
    const ctx = toEligibilityContext(toEngineProfile({ ...REQUIRED, age: 30 }));
    expect(ctx).toEqual({
      residency: 'us_citizen',
      stateOfResidence: 'CA',
      age: 30,
      filingStatus: 'single',
      depositAmount: 1000000,
    });
  });
  it('never carries income or the city rate', () => {
    const keys = Object.keys(
      toEngineProfile({ ...REQUIRED, cityMarginalRate: Rate.parse('0.01') }),
    );
    expect(keys.sort()).toEqual(['filingStatus', 'residency', 'scenario', 'stateCode']);
  });
});
