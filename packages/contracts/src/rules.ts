import { z } from 'zod';

// Rule field names differ from Profile (stateOfResidence ← stateCode, depositAmount ← scenario.principal).
// engine's toEligibilityContext maps them with an explicit allowlist, never by spreading the profile.
export const ProfileField = z.enum([
  'residency',
  'stateOfResidence',
  'age',
  'filingStatus',
  'depositAmount',
]);
export type ProfileField = z.infer<typeof ProfileField>;

interface Label {
  label?: string | undefined;
}
/** Eligibility rule as data (ADR-010). Empty `and` means no restriction, empty `or` means never. */
export type Rule =
  | (Label & { op: 'and' | 'or'; args: Rule[] })
  | (Label & { op: 'not'; arg: Rule })
  | (Label & { op: 'eq' | 'neq'; field: ProfileField; value: string | number })
  | (Label & { op: 'gte' | 'lte'; field: ProfileField; value: number })
  | (Label & { op: 'in'; field: ProfileField; values: (string | number)[] });

/** Deeper trees are rejected so a malformed fixture cannot hang the UI. */
export const MAX_RULE_DEPTH = 8;

const label = z.string().optional();
const scalar = z.union([z.string(), z.number()]);

const RuleNode: z.ZodType<Rule> = z.lazy(() =>
  z.union([
    z.strictObject({ op: z.enum(['and', 'or']), args: z.array(RuleNode), label }),
    z.strictObject({ op: z.literal('not'), arg: RuleNode, label }),
    z.strictObject({ op: z.enum(['eq', 'neq']), field: ProfileField, value: scalar, label }),
    z.strictObject({ op: z.enum(['gte', 'lte']), field: ProfileField, value: z.number(), label }),
    z.strictObject({
      op: z.literal('in'),
      field: ProfileField,
      values: z.array(scalar).min(1),
      label,
    }),
  ]),
);

/** Depth of a rule tree; a leaf is 1. */
export function ruleDepth(rule: Rule): number {
  switch (rule.op) {
    case 'and':
    case 'or':
      return 1 + Math.max(0, ...rule.args.map(ruleDepth));
    case 'not':
      return 1 + ruleDepth(rule.arg);
    case 'eq':
    case 'neq':
    case 'gte':
    case 'lte':
    case 'in':
      return 1;
  }
}

export const Rule: z.ZodType<Rule> = RuleNode.refine((r) => ruleDepth(r) <= MAX_RULE_DEPTH, {
  error: `Rule tree deeper than ${String(MAX_RULE_DEPTH)}`,
});
