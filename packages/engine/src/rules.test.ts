import { Cents, ProfileField, Rate, type Profile, type Rule } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { EngineError } from './errors';
import {
  evaluateEligibility,
  productEligibilityRule,
  toEligibilityContext,
  type EligibilityContext,
  type Tri,
} from './rules';

const CTX: EligibilityContext = { residency: 'us_citizen', depositAmount: 500000 };
const LEAF: Record<string, Rule> = {
  T: { op: 'eq', field: 'residency', value: 'us_citizen' },
  F: { op: 'eq', field: 'residency', value: 'nonresident' },
  U: { op: 'gte', field: 'age', value: 18 },
};
const TRI: Record<string, Tri> = { T: true, F: false, U: 'unknown' };
const result = (rule: Rule, ctx = CTX): Tri => evaluateEligibility(rule, ctx).trace.result;

// independent calc: Kleene K3 truth tables, written out by hand from spec §5
const AND = { TT: 'T', TF: 'F', TU: 'U', FT: 'F', FF: 'F', FU: 'F', UT: 'U', UF: 'F', UU: 'U' };
const OR = { TT: 'T', TF: 'T', TU: 'T', FT: 'T', FF: 'F', FU: 'U', UT: 'T', UF: 'U', UU: 'U' };
const NOT = { T: 'F', F: 'T', U: 'U' };

const pairs = (table: Record<string, string>): [string, string, string][] =>
  Object.entries(table).map(([ab, out]) => [ab.charAt(0), ab.charAt(1), out]);

describe('Kleene logic', () => {
  it.each(pairs(AND))('golden: %s and %s is %s', (a, b, out) => {
    expect(result({ op: 'and', args: [LEAF[a]!, LEAF[b]!] })).toBe(TRI[out]);
  });
  it.each(pairs(OR))('golden: %s or %s is %s', (a, b, out) => {
    expect(result({ op: 'or', args: [LEAF[a]!, LEAF[b]!] })).toBe(TRI[out]);
  });
  it.each(Object.entries(NOT))('golden: not %s is %s', (a, out) => {
    expect(result({ op: 'not', arg: LEAF[a]! })).toBe(TRI[out]);
  });
  it('an empty and means no restriction, an empty or means never', () => {
    expect([result({ op: 'and', args: [] }), result({ op: 'or', args: [] })]).toEqual([
      true,
      false,
    ]);
  });
});

describe('leaf operations', () => {
  it.each<[Rule, Tri]>([
    [{ op: 'eq', field: 'residency', value: 'us_citizen' }, true],
    [{ op: 'neq', field: 'residency', value: 'us_citizen' }, false],
    [{ op: 'neq', field: 'residency', value: 'nonresident' }, true],
    [{ op: 'gte', field: 'depositAmount', value: 500000 }, true],
    [{ op: 'gte', field: 'depositAmount', value: 500001 }, false],
    [{ op: 'lte', field: 'depositAmount', value: 500000 }, true],
    [{ op: 'lte', field: 'depositAmount', value: 499999 }, false],
    [{ op: 'in', field: 'residency', values: ['us_resident', 'us_citizen'] }, true],
    [{ op: 'in', field: 'residency', values: ['nonresident'] }, false],
  ])('%j is %s', (rule, out) => {
    expect(result(rule)).toBe(out);
  });
  it.each<Rule>([
    { op: 'eq', field: 'age', value: '18' },
    { op: 'neq', field: 'residency', value: 1 },
    { op: 'gte', field: 'residency', value: 1 },
    { op: 'in', field: 'depositAmount', values: [100, '200'] },
  ])('a type mismatch is invalid_rule: %j', (rule) => {
    expect(() => evaluateEligibility(rule, CTX)).toThrow(EngineError);
    expect(() => evaluateEligibility(rule, {})).toThrow(/^invalid_rule/);
  });
});

describe('result', () => {
  it('maps the root to a status', () => {
    const status = (rule: Rule): string => evaluateEligibility(rule, CTX).status;
    expect([status(LEAF['T']!), status(LEAF['F']!), status(LEAF['U']!)]).toEqual([
      'eligible',
      'ineligible',
      'needs_profile',
    ]);
  });
  it('lists missing fields in schema order, whatever order the tree visits them', () => {
    const rule: Rule = {
      op: 'or',
      args: [
        { op: 'gte', field: 'depositAmount', value: 1 },
        { op: 'eq', field: 'filingStatus', value: 'single' },
        { op: 'gte', field: 'age', value: 18 },
        { op: 'eq', field: 'stateOfResidence', value: 'CA' },
        { op: 'gte', field: 'age', value: 21 },
      ],
    };
    expect(evaluateEligibility(rule, {}).missingFields).toEqual([
      'stateOfResidence',
      'age',
      'filingStatus',
      'depositAmount',
    ]);
  });
  it('reports missing fields even under a false sibling', () => {
    const r = evaluateEligibility({ op: 'and', args: [LEAF['F']!, LEAF['U']!] }, CTX);
    expect([r.status, r.missingFields]).toEqual(['ineligible', ['age']]);
  });
  it('traces paths, labels, actual and expected values', () => {
    const rule: Rule = { op: 'not', label: 'Not in NY', arg: LEAF['F']! };
    expect(evaluateEligibility(rule, CTX).trace).toEqual({
      path: '$',
      op: 'not',
      label: 'Not in NY',
      result: true,
      children: [
        {
          path: '$.arg',
          op: 'eq',
          result: false,
          actual: 'us_citizen',
          expected: 'nonresident',
        },
      ],
    });
  });
  it('an unknown leaf has no actual value', () => {
    expect(evaluateEligibility(LEAF['U']!, CTX).trace).toEqual({
      path: '$',
      op: 'gte',
      result: 'unknown',
      expected: 18,
    });
  });
});

describe('productEligibilityRule', () => {
  const product = {
    eligibility: { op: 'and', args: [] } satisfies Rule,
    minOpening: Cents.parse(100000),
    maxDeposit: Cents.parse(1000000),
  };
  it('adds the deposit limits as labelled leaves', () => {
    const { trace } = evaluateEligibility(productEligibilityRule(product), {
      depositAmount: 50000,
    });
    expect(trace.children?.map((c) => [c.label, c.result])).toEqual([
      [undefined, true],
      ['Minimum opening deposit', false],
      ['Maximum deposit', true],
    ]);
  });
  it('has no maximum leaf without a maxDeposit', () => {
    const rule = productEligibilityRule({ ...product, maxDeposit: null });
    expect(rule.op === 'and' ? rule.args.length : 0).toBe(2);
  });
});

describe('toEligibilityContext', () => {
  const full: Profile = {
    version: 1,
    taxYear: 2026,
    filingStatus: 'married_joint',
    stateCode: 'NY',
    taxableIncome: Cents.parse(12345600),
    cityMarginalRate: Rate.parse('0.03'),
    residency: 'us_resident',
    age: 40,
    scenario: { principal: Cents.parse(2500000), holdingMonths: 12 },
  };
  it('maps the allowlisted fields and renames them for the rules', () => {
    expect(toEligibilityContext(full)).toEqual({
      residency: 'us_resident',
      stateOfResidence: 'NY',
      age: 40,
      filingStatus: 'married_joint',
      depositAmount: 2500000,
    });
  });
  it('never carries a key outside the rule fields (ADR-004)', () => {
    const keys = Object.keys(toEligibilityContext(full));
    expect(keys.every((k) => (ProfileField.options as readonly string[]).includes(k))).toBe(true);
  });
  it('leaves unknown fields out, including a null age', () => {
    expect(toEligibilityContext({ age: null, residency: 'nonresident' })).toEqual({
      residency: 'nonresident',
    });
  });
});
