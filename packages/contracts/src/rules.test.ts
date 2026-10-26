import { describe, expect, it } from 'vitest';
import { MAX_RULE_DEPTH, Rule, ruleDepth } from './rules';

const leaf = { op: 'eq', field: 'residency', value: 'us_citizen' } as const;

function nestNot(depth: number): unknown {
  let node: unknown = leaf;
  for (let i = 1; i < depth; i += 1) node = { op: 'not', arg: node };
  return node;
}

describe('Rule schema', () => {
  it('accepts a nested rule with labels', () => {
    const rule = {
      op: 'and',
      label: 'US residents over 18',
      args: [
        { op: 'in', field: 'residency', values: ['us_citizen', 'us_resident'] },
        { op: 'gte', field: 'age', value: 18, label: 'Age 18+' },
        { op: 'not', arg: { op: 'eq', field: 'stateOfResidence', value: 'NY' } },
        { op: 'or', args: [{ op: 'lte', field: 'depositAmount', value: 25000000 }] },
      ],
    };
    expect(Rule.safeParse(rule).success).toBe(true);
  });

  it('accepts empty and (no restriction) and empty or (never)', () => {
    expect(Rule.safeParse({ op: 'and', args: [] }).success).toBe(true);
    expect(Rule.safeParse({ op: 'or', args: [] }).success).toBe(true);
  });

  it('rejects in with no values', () => {
    expect(Rule.safeParse({ op: 'in', field: 'age', values: [] }).success).toBe(false);
  });

  it('rejects gte with a string value and unknown fields or ops', () => {
    expect(Rule.safeParse({ op: 'gte', field: 'age', value: '18' }).success).toBe(false);
    expect(Rule.safeParse({ op: 'eq', field: 'income', value: 1 }).success).toBe(false);
    expect(Rule.safeParse({ op: 'xor', args: [] }).success).toBe(false);
  });

  it('rejects extra keys on any node', () => {
    expect(Rule.safeParse({ ...leaf, sponsor: 'x' }).success).toBe(false);
    expect(Rule.safeParse({ op: 'and', args: [{ ...leaf, extra: 1 }] }).success).toBe(false);
  });

  it(`accepts depth ${String(MAX_RULE_DEPTH)} and rejects depth ${String(MAX_RULE_DEPTH + 1)}`, () => {
    expect(Rule.safeParse(nestNot(MAX_RULE_DEPTH)).success).toBe(true);
    expect(Rule.safeParse(nestNot(MAX_RULE_DEPTH + 1)).success).toBe(false);
  });
});

describe('ruleDepth', () => {
  it('counts a leaf as 1 and an empty group as 1', () => {
    expect(ruleDepth(leaf)).toBe(1);
    expect(ruleDepth({ op: 'and', args: [] })).toBe(1);
  });
  it('takes the deepest branch', () => {
    expect(
      ruleDepth({ op: 'or', args: [leaf, { op: 'not', arg: { op: 'not', arg: leaf } }] }),
    ).toBe(4);
  });
});
