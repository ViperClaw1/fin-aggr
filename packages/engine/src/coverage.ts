// Deposit insurance coverage plan (spec §5 planCoverage, rules 1–6).
import {
  formatUsd,
  type Assumption,
  type CalcStep,
  type Cents,
  type Id,
  type Institution,
  type InsuranceRules,
} from '@fa/contracts';
import type { Decimal } from 'decimal.js';
import { EngineError } from './errors';
import { D, decCents, toCents } from './money';

export type OwnershipCategory = 'single' | 'joint';
type Regulator = keyof InsuranceRules['byRegulator'];

export interface CoverageCandidate {
  institutionId: Id;
  regulator: Regulator;
  kind: Institution['kind'];
  /** lower comes first */
  preference: number;
}

export interface CoverageInput {
  accounts: readonly { category: OwnershipCategory; amount: Cents }[];
  candidates: readonly CoverageCandidate[];
  rules: InsuranceRules;
  /** room kept inside the limit for accrued interest */
  interestReservePerAllocation: Cents;
  maxInstitutions?: number;
}

export interface Allocation {
  institutionId: Id;
  category: OwnershipCategory;
  amount: Cents;
}

export interface CoveragePlan {
  allocations: readonly Allocation[];
  insuredTotal: Cents;
  uninsuredTotal: Cents;
  institutionsUsed: number;
  steps: readonly CalcStep[];
  assumptions: readonly Assumption[];
  warnings: readonly string[];
}

const CATEGORIES: readonly OwnershipCategory[] = ['single', 'joint'];

const ASSUMPTIONS: readonly Assumption[] = [
  {
    id: 'no_other_deposits',
    text: 'You hold no other deposits at these institutions.',
    editable: false,
  },
  { id: 'two_joint_owners', text: 'Joint accounts have exactly two owners.', editable: false },
  {
    id: 'limits_from_reference',
    text: 'Limits come from the insurance reference data, which is not yet verified.',
    editable: false,
  },
  {
    id: 'no_pass_through_insurance',
    text: 'Pass-through insurance through fintech programs is not modeled.',
    editable: false,
  },
  {
    id: 'not_legal_advice',
    text: 'This is an estimate, not a legal determination. Check with the official FDIC calculator.',
    editable: false,
  },
];

const byPreferenceThenId = (a: CoverageCandidate, b: CoverageCandidate): number => {
  if (a.preference !== b.preference) return a.preference - b.preference;
  if (a.institutionId === b.institutionId) return 0;
  return a.institutionId < b.institutionId ? -1 : 1;
};

function validate({
  accounts,
  interestReservePerAllocation,
  maxInstitutions,
}: CoverageInput): void {
  if (accounts.some((a) => decCents(a.amount).isNeg()))
    throw new EngineError('invalid_input', 'account amounts must be ≥ 0');
  if (decCents(interestReservePerAllocation).isNeg())
    throw new EngineError('invalid_input', 'interest reserve must be ≥ 0');
  if (
    maxInstitutions !== undefined &&
    !(Number.isSafeInteger(maxInstitutions) && maxInstitutions >= 0)
  )
    throw new EngineError('invalid_input', 'maxInstitutions must be an integer ≥ 0');
}

/** Insured candidates in order, one per institution (the first after sorting wins). */
function usable(candidates: readonly CoverageCandidate[], warnings: string[]): CoverageCandidate[] {
  const seen = new Set<Id>();
  const out: CoverageCandidate[] = [];
  for (const c of [...candidates].sort(byPreferenceThenId)) {
    if (seen.has(c.institutionId)) continue;
    seen.add(c.institutionId);
    if (c.kind === 'fintech_partner')
      warnings.push(
        `${c.institutionId} is a fintech partner: pass-through insurance is not modeled, so it was skipped.`,
      );
    else out.push(c);
  }
  return out;
}

/** Room per institution in a category: the limit (× owners for joint) minus the reserve, ≥ 0. */
function room(input: CoverageInput, c: CoverageCandidate, category: OwnershipCategory): Decimal {
  const { rules } = input;
  const limit = decCents(rules.byRegulator[c.regulator].limitPerOwnerPerInstitutionPerCategory);
  const owners = category === 'joint' ? rules.jointOwnersAssumed : 1;
  return D.max(0, limit.times(owners).minus(decCents(input.interestReservePerAllocation)));
}

export function planCoverage(input: CoverageInput): CoveragePlan {
  validate(input);
  const warnings: string[] = [];
  const candidates = usable(input.candidates, warnings);
  const max = input.maxInstitutions ?? Number.MAX_SAFE_INTEGER;
  const used = new Set<Id>();
  const allocations: Allocation[] = [];
  const steps: CalcStep[] = [];
  let total = new D(0);
  let insured = new D(0);

  for (const category of CATEGORIES) {
    const accounts = input.accounts.filter((a) => a.category === category);
    if (accounts.length === 0) continue;
    if (!input.rules.supportedCategories.includes(category))
      throw new EngineError('invalid_input', `${category} accounts are not covered by the rules`);
    let left = accounts.reduce((sum, a) => sum.plus(decCents(a.amount)), new D(0));
    total = total.plus(left);
    for (const c of candidates) {
      if (left.isZero()) break;
      if (!used.has(c.institutionId) && used.size >= max) continue;
      const amount = D.min(left, room(input, c, category));
      if (amount.isZero()) continue;
      used.add(c.institutionId);
      allocations.push({ institutionId: c.institutionId, category, amount: toCents(amount) });
      insured = insured.plus(amount);
      left = left.minus(amount);
    }
    steps.push({
      id: `category_${category}`,
      label: `${category === 'single' ? 'Single' : 'Joint'} accounts`,
      formula: 'fill institutions in order up to (limit × owners − reserve) each',
      inputs: { reserve: formatUsd(input.interestReservePerAllocation) },
      result: `${formatUsd(toCents(left))} not covered`,
    });
  }

  return {
    allocations,
    insuredTotal: toCents(insured),
    uninsuredTotal: toCents(total.minus(insured)),
    institutionsUsed: used.size,
    steps,
    assumptions: ASSUMPTIONS,
    warnings,
  };
}
