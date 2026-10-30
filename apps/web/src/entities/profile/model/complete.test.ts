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

// the year of the tax tables the caller loaded
const Y = 2026;

describe('toCompleteProfile', () => {
  it('is null until all four required fields are present', () => {
    for (const field of Object.keys(REQUIRED) as (keyof ProfileDraft)[]) {
      const rest = Object.fromEntries(Object.entries(REQUIRED).filter(([k]) => k !== field));
      expect(toCompleteProfile(rest, Y)).toBeNull();
    }
  });
  it('fills the defaults: tax year 2026, no city rate, no age, $10,000 for 12 months', () => {
    expect(toCompleteProfile(REQUIRED, Y)).toEqual({
      ...REQUIRED,
      version: 1,
      taxYear: 2026,
      cityMarginalRate: null,
      age: null,
      scenario: { principal: 1000000, holdingMonths: 12 },
    });
  });
  it('keeps what the user entered, including half a scenario', () => {
    const p = toCompleteProfile(
      {
        ...REQUIRED,
        age: 40,
        cityMarginalRate: Rate.parse('0.03'),
        scenario: { holdingMonths: 6 },
      },
      Y,
    );
    expect([p?.age, p?.cityMarginalRate, p?.scenario]).toEqual([
      40,
      '0.03',
      { principal: 1000000, holdingMonths: 6 },
    ]);
  });
  it('an explicit undefined does not erase a default', () => {
    expect(toCompleteProfile({ ...REQUIRED, age: undefined }, Y)?.age).toBeNull();
  });
  it('calculates a year without tax tables (an imported 2025) with the tables year', () => {
    expect(toCompleteProfile({ ...REQUIRED, taxYear: 2025 }, Y)?.taxYear).toBe(2026);
  });
  it('takes the year from the loaded tables, not a constant (2027 tables)', () => {
    expect(toCompleteProfile(REQUIRED, 2027)?.taxYear).toBe(2027);
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
  it('names the default scenario and the unset city rate as editable, and the tax year as not', () => {
    expect(defaultAssumptions({}, Y)).toEqual([
      {
        id: 'default_scenario',
        text: 'Scenario: $10,000.00 for 12 months until you change it.',
        editable: true,
      },
      {
        id: 'city_marginal_rate',
        text: 'City income tax rate is not set, so local tax is zero until you change it.',
        editable: true,
      },
      { id: 'default_tax_year', text: 'Tax year 2026.', editable: false },
    ]);
  });
  it('says when the profile year has no tables', () => {
    const draft = { taxYear: 2025, scenario: { principal: Cents.parse(5), holdingMonths: 3 } };
    expect(defaultAssumptions(draft, Y)).toEqual([
      {
        id: 'city_marginal_rate',
        text: 'City income tax rate is not set, so local tax is zero until you change it.',
        editable: true,
      },
      {
        id: 'default_tax_year',
        text: 'Tax year 2026 (2025 tables not available).',
        editable: false,
      },
    ]);
  });
  it('names the tables year: a 2026 profile with 2027 tables', () => {
    const draft = { taxYear: 2026, scenario: { principal: Cents.parse(5), holdingMonths: 3 } };
    expect(defaultAssumptions(draft, 2027)).toEqual([
      {
        id: 'city_marginal_rate',
        text: 'City income tax rate is not set, so local tax is zero until you change it.',
        editable: true,
      },
      {
        id: 'default_tax_year',
        text: 'Tax year 2027 (2026 tables not available).',
        editable: false,
      },
    ]);
  });
  it('keeps the city rate editable once the scenario and tax year are set', () => {
    const draft = { taxYear: 2026, scenario: { principal: Cents.parse(5), holdingMonths: 3 } };
    expect(defaultAssumptions(draft, Y)).toEqual([
      {
        id: 'city_marginal_rate',
        text: 'City income tax rate is not set, so local tax is zero until you change it.',
        editable: true,
      },
      { id: 'default_tax_year', text: 'Tax year 2026.', editable: false },
    ]);
  });
  it('drops the city assumption once a city rate is set', () => {
    const draft = {
      taxYear: 2026,
      cityMarginalRate: Rate.parse('0.01'),
      scenario: { principal: Cents.parse(5), holdingMonths: 3 },
    };
    expect(defaultAssumptions(draft, Y)).toEqual([
      { id: 'default_tax_year', text: 'Tax year 2026.', editable: false },
    ]);
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
