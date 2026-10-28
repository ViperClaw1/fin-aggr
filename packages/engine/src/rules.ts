// Eligibility with Kleene three-valued logic and a trace (spec §5, ADR-010, E2 decision 5).
import { ProfileField, type Product, type Profile, type Rule } from '@fa/contracts';
import { EngineError } from './errors';

export type Tri = true | false | 'unknown';

export interface EligibilityContext {
  residency?: string;
  stateOfResidence?: string;
  age?: number;
  filingStatus?: string;
  /** in cents */
  depositAmount?: number;
}

export interface RuleTraceNode {
  path: string;
  label?: string;
  /** Leaves only: which profile field was compared, so the UI can format actual and expected. */
  field?: ProfileField;
  op: Rule['op'];
  result: Tri;
  actual?: string | number;
  expected?: string | number | readonly (string | number)[];
  children?: readonly RuleTraceNode[];
}

export interface EligibilityResult {
  status: 'eligible' | 'ineligible' | 'needs_profile';
  missingFields: readonly ProfileField[];
  trace: RuleTraceNode;
}

const FIELD_TYPE: Record<ProfileField, 'string' | 'number'> = {
  residency: 'string',
  stateOfResidence: 'string',
  age: 'number',
  filingStatus: 'string',
  depositAmount: 'number',
};

/** Explicit allowlist (ADR-004): no other profile field reaches the rules. */
export function toEligibilityContext(profile: Partial<Profile>): EligibilityContext {
  const ctx: EligibilityContext = {};
  if (profile.residency !== undefined) ctx.residency = profile.residency;
  if (profile.stateCode !== undefined) ctx.stateOfResidence = profile.stateCode;
  if (profile.age !== undefined && profile.age !== null) ctx.age = profile.age;
  if (profile.filingStatus !== undefined) ctx.filingStatus = profile.filingStatus;
  if (profile.scenario !== undefined) ctx.depositAmount = profile.scenario.principal;
  return ctx;
}

/** The product's own rule plus its deposit limits as implicit leaves. */
export function productEligibilityRule(
  product: Pick<Product, 'eligibility' | 'minOpening' | 'maxDeposit'>,
): Rule {
  const limits: Rule[] = [
    {
      op: 'gte',
      field: 'depositAmount',
      value: product.minOpening,
      label: 'Minimum opening deposit',
    },
  ];
  if (product.maxDeposit !== null)
    limits.push({
      op: 'lte',
      field: 'depositAmount',
      value: product.maxDeposit,
      label: 'Maximum deposit',
    });
  return { op: 'and', args: [product.eligibility, ...limits] };
}

function and(xs: readonly Tri[]): Tri {
  if (xs.includes(false)) return false;
  return xs.includes('unknown') ? 'unknown' : true;
}
function or(xs: readonly Tri[]): Tri {
  if (xs.includes(true)) return true;
  return xs.includes('unknown') ? 'unknown' : false;
}
const not = (x: Tri): Tri => (x === 'unknown' ? x : !x);

type Leaf = Extract<Rule, { field: ProfileField }>;

function checkTypes(rule: Leaf, path: string): void {
  const want = FIELD_TYPE[rule.field];
  const values = rule.op === 'in' ? rule.values : [rule.value];
  const numeric = rule.op === 'gte' || rule.op === 'lte';
  if ((numeric && want !== 'number') || values.some((v) => typeof v !== want))
    throw new EngineError('invalid_rule', `${path}: ${rule.op} on ${rule.field} needs ${want}`);
}

function compare(rule: Leaf, actual: string | number): boolean {
  switch (rule.op) {
    case 'eq':
      return actual === rule.value;
    case 'neq':
      return actual !== rule.value;
    case 'gte':
      return typeof actual === 'number' && actual >= rule.value;
    case 'lte':
      return typeof actual === 'number' && actual <= rule.value;
    case 'in':
      return rule.values.includes(actual);
  }
}

function leaf(
  rule: Leaf,
  path: string,
  ctx: EligibilityContext,
  missing: Set<ProfileField>,
): RuleTraceNode {
  checkTypes(rule, path);
  const actual = ctx[rule.field];
  if (actual === undefined) missing.add(rule.field);
  const node: RuleTraceNode = {
    path,
    field: rule.field,
    op: rule.op,
    result: actual === undefined ? 'unknown' : compare(rule, actual),
    expected: rule.op === 'in' ? rule.values : rule.value,
  };
  if (actual !== undefined) node.actual = actual;
  return node;
}

function evaluate(
  rule: Rule,
  path: string,
  ctx: EligibilityContext,
  missing: Set<ProfileField>,
): RuleTraceNode {
  switch (rule.op) {
    case 'and':
    case 'or': {
      // every child is evaluated (no short circuit) so the trace and missingFields are complete
      const children = rule.args.map((r, i) => walk(r, `${path}.args[${String(i)}]`, ctx, missing));
      const results = children.map((c) => c.result);
      return {
        path,
        op: rule.op,
        result: rule.op === 'and' ? and(results) : or(results),
        children,
      };
    }
    case 'not': {
      const child = walk(rule.arg, `${path}.arg`, ctx, missing);
      return { path, op: 'not', result: not(child.result), children: [child] };
    }
    case 'eq':
    case 'neq':
    case 'gte':
    case 'lte':
    case 'in':
      return leaf(rule, path, ctx, missing);
  }
}

function walk(
  rule: Rule,
  path: string,
  ctx: EligibilityContext,
  missing: Set<ProfileField>,
): RuleTraceNode {
  const node = evaluate(rule, path, ctx, missing);
  if (rule.label !== undefined) node.label = rule.label;
  return node;
}

const STATUS = { true: 'eligible', false: 'ineligible', unknown: 'needs_profile' } as const;

export function evaluateEligibility(rule: Rule, ctx: EligibilityContext): EligibilityResult {
  const missing = new Set<ProfileField>();
  const trace = walk(rule, '$', ctx, missing);
  return {
    status: STATUS[String(trace.result) as keyof typeof STATUS],
    // stable: the schema's field order, not the order the tree visits them
    missingFields: ProfileField.options.filter((f) => missing.has(f)),
    trace,
  };
}
