import { Cents, FilingStatus, Rate } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { D } from './money';
import { taxesOnInterest, type TaxInput, type Taxes, type TaxProfile } from './tax';
import { TABLES } from './test-data';

// independent calc: packages/engine/golden/tax.py
const EXPECTED = {
  'single.oneCentAtEdge': '0.1',
  'single.oneCentAboveEdge': '0.2',
  'married_joint.oneCentAtEdge': '0.1',
  'married_joint.oneCentAboveEdge': '0.2',
  'married_separate.oneCentAtEdge': '0.1',
  'married_separate.oneCentAboveEdge': '0.2',
  'head_of_household.oneCentAtEdge': '0.1',
  'head_of_household.oneCentAboveEdge': '0.2',
  'crossing.federal': '32037.1',
  'ca.state': '7407.42',
  'ca.local': '1234.57',
  'tx.state': '0',
} as const;

const FIRST_EDGE: Record<FilingStatus, number> = {
  single: 2000000,
  married_joint: 4000000,
  married_separate: 2000000,
  head_of_household: 3000000,
};
const BASE = 123457;

function taxes(profile: Partial<TaxProfile>, rest: Partial<Omit<TaxInput, 'profile'>> = {}): Taxes {
  return taxesOnInterest({
    tables: TABLES,
    taxTreatment: 'taxable',
    base: new D(BASE),
    ...rest,
    profile: {
      filingStatus: 'single',
      stateCode: 'CA',
      taxableIncome: Cents.parse(0),
      cityMarginalRate: null,
      ...profile,
    },
  });
}

describe('federal brackets: upTo is inclusive', () => {
  it.each(FilingStatus.options)('golden: %s, the cent that reaches the edge is taxed low', (s) => {
    const income = Cents.parse(FIRST_EDGE[s] - 1);
    const { federal } = taxes({ filingStatus: s, taxableIncome: income }, { base: new D(1) });
    expect(federal.toString()).toBe(EXPECTED[`${s}.oneCentAtEdge`]);
  });
  it.each(FilingStatus.options)('golden: %s, the cent past the edge is taxed high', (s) => {
    const income = Cents.parse(FIRST_EDGE[s]);
    const { federal } = taxes({ filingStatus: s, taxableIncome: income }, { base: new D(1) });
    expect(federal.toString()).toBe(EXPECTED[`${s}.oneCentAboveEdge`]);
  });
});

describe('taxes on interest', () => {
  it('golden: interest that crosses a bracket is split between two rates', () => {
    const { federal } = taxes({ taxableIncome: Cents.parse(7950000) });
    expect(federal.toString()).toBe(EXPECTED['crossing.federal']);
  });
  it('golden: state and city flat rates apply to the same base', () => {
    const { state, local } = taxes({ cityMarginalRate: Rate.parse('0.01') });
    expect([state.toString(), local.toString()]).toEqual([
      EXPECTED['ca.state'],
      EXPECTED['ca.local'],
    ]);
  });
  it('golden: a state without income tax takes nothing', () => {
    expect(taxes({ stateCode: 'TX' }).state.toString()).toBe(EXPECTED['tx.state']);
  });
  it('state_local_exempt zeroes state and city but not federal', () => {
    const t = taxes(
      { cityMarginalRate: Rate.parse('0.01'), taxableIncome: Cents.parse(7950000) },
      { taxTreatment: 'state_local_exempt' },
    );
    expect([t.state.toString(), t.local.toString(), t.federal.toString()]).toEqual([
      '0',
      '0',
      EXPECTED['crossing.federal'],
    ]);
  });
  it('federal_exempt zeroes federal but not state', () => {
    const t = taxes({ taxableIncome: Cents.parse(7950000) }, { taxTreatment: 'federal_exempt' });
    expect([t.federal.toString(), t.state.toString()]).toEqual(['0', EXPECTED['ca.state']]);
  });
});
