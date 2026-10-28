import type { EligibilityResult, RuleTraceNode } from '@fa/engine';
import { describe, expect, it } from 'vitest';
import { explainEligibility } from './explain-eligibility';

const result = (
  status: EligibilityResult['status'],
  trace: RuleTraceNode,
  missingFields: EligibilityResult['missingFields'] = [],
): EligibilityResult => ({ status, trace, missingFields });

const pass: RuleTraceNode = { path: '$.args[0]', op: 'and', result: true, children: [] };

describe('explainEligibility', () => {
  it('says eligible without reasons', () => {
    expect(explainEligibility(result('eligible', pass))).toEqual({
      status: 'eligible',
      headline: 'Eligible',
      reasons: [],
    });
  });

  it('formats an unlabelled money leaf in dollars, not cents', () => {
    const trace: RuleTraceNode = {
      path: '$',
      field: 'depositAmount',
      op: 'gte',
      result: false,
      actual: 50000,
      expected: 100000,
    };
    expect(explainEligibility(result('ineligible', trace)).reasons).toEqual([
      'Deposit amount: deposit amount must be at least $1,000.00 (yours: $500.00)',
    ]);
  });

  it('keeps a labelled leaf and turns codes into words', () => {
    const trace: RuleTraceNode = {
      path: '$',
      label: 'Not for nonresidents',
      field: 'residency',
      op: 'neq',
      result: false,
      actual: 'nonresident',
      expected: 'nonresident',
    };
    expect(explainEligibility(result('ineligible', trace)).reasons).toEqual([
      'Not for nonresidents: residency status must not be Nonresident (yours: Nonresident)',
    ]);
  });

  it('descends through unlabelled and/or to the failing rules only', () => {
    const trace: RuleTraceNode = {
      path: '$',
      op: 'and',
      result: false,
      children: [
        pass,
        {
          path: '$.args[1]',
          op: 'or',
          result: false,
          children: [
            {
              path: '$.args[1].args[0]',
              label: 'Residents of CA or TX',
              op: 'in',
              field: 'stateOfResidence',
              result: false,
              actual: 'NY',
              expected: ['CA', 'TX'],
            },
          ],
        },
        { path: '$.args[2]', label: 'Not available in NY', op: 'not', result: false, children: [] },
      ],
    };
    expect(explainEligibility(result('ineligible', trace)).reasons).toEqual([
      'Residents of CA or TX: state of residence must be one of CA, TX (yours: NY)',
      'Not available in NY',
    ]);
  });

  it('stops at a labelled composite rule', () => {
    const trace: RuleTraceNode = {
      path: '$',
      label: 'Deposit between $1,000 and $1,000,000',
      op: 'and',
      result: false,
      children: [
        {
          path: '$.args[0]',
          field: 'depositAmount',
          op: 'gte',
          result: false,
          actual: 1,
          expected: 100000,
        },
      ],
    };
    expect(explainEligibility(result('ineligible', trace)).reasons).toEqual([
      'Deposit between $1,000 and $1,000,000',
    ]);
  });

  it('asks for the one missing field by name', () => {
    const unknown: RuleTraceNode = {
      path: '$',
      field: 'age',
      op: 'gte',
      result: 'unknown',
      expected: 18,
    };
    expect(explainEligibility(result('needs_profile', unknown, ['age']))).toEqual({
      status: 'needs_profile',
      headline: 'Add your age to check',
      reasons: ['Add your age to check'],
    });
  });

  it('asks generally when several fields are missing', () => {
    const r = explainEligibility(result('needs_profile', pass, ['age', 'stateOfResidence']));
    expect(r.headline).toBe('Add your details to check');
    expect(r.reasons).toHaveLength(2);
  });
});
