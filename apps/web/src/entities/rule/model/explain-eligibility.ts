// Eligibility result → words. Reasons come from the engine trace: a rule's own label when it has
// one, otherwise a sentence built from the leaf's field, operator and values.
import {
  centsFromSafeInteger,
  FILING_STATUS_LABEL,
  formatUsd,
  PROFILE_FIELD_LABEL,
  RESIDENCY_LABEL,
  type ProfileField,
} from '@fa/contracts';
import type { EligibilityResult, RuleTraceNode } from '@fa/engine';

export interface EligibilityExplanation {
  status: EligibilityResult['status'];
  headline: string;
  reasons: string[];
}

type Scalar = string | number;

function formatValue(field: ProfileField, v: Scalar): string {
  if (field === 'depositAmount' && typeof v === 'number') return formatUsd(centsFromSafeInteger(v));
  if (field === 'filingStatus' && v in FILING_STATUS_LABEL) {
    return FILING_STATUS_LABEL[v as keyof typeof FILING_STATUS_LABEL];
  }
  if (field === 'residency' && v in RESIDENCY_LABEL) {
    return RESIDENCY_LABEL[v as keyof typeof RESIDENCY_LABEL];
  }
  return String(v);
}

const OP_WORDS: Partial<Record<RuleTraceNode['op'], string>> = {
  eq: 'must be',
  neq: 'must not be',
  gte: 'must be at least',
  lte: 'must be at most',
  in: 'must be one of',
};

function leafReason(node: RuleTraceNode): string | undefined {
  const { field, expected, actual } = node;
  const words = OP_WORDS[node.op];
  if (field === undefined || expected === undefined || words === undefined) return node.label;
  const need = (Array.isArray(expected) ? expected : [expected])
    .map((v: Scalar) => formatValue(field, v))
    .join(', ');
  const name = PROFILE_FIELD_LABEL[field];
  const yours = actual === undefined ? '' : ` (yours: ${formatValue(field, actual)})`;
  const rule = node.label ?? `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  return `${rule}: ${name} ${words} ${need}${yours}`;
}

/** The deepest failing rules that explain a `false`: a label stops the descent. */
function failingReasons(node: RuleTraceNode): string[] {
  if (node.result !== false) return [];
  const failingChildren = (node.children ?? []).filter((c) => c.result === false);
  if (node.field !== undefined) return [leafReason(node) ?? 'A product requirement is not met'];
  if (node.label !== undefined || node.op === 'not' || failingChildren.length === 0) {
    return [node.label ?? 'A product requirement is not met'];
  }
  return failingChildren.flatMap(failingReasons);
}

export function explainEligibility(result: EligibilityResult): EligibilityExplanation {
  const { status } = result;
  if (status === 'eligible') return { status, headline: 'Eligible', reasons: [] };
  if (status === 'ineligible') {
    return {
      status,
      headline: 'Not eligible',
      reasons: [...new Set(failingReasons(result.trace))],
    };
  }
  const missing = result.missingFields.map((f) => PROFILE_FIELD_LABEL[f]);
  return {
    status,
    // one field: the headline already says it, a reason would repeat it word for word
    headline:
      missing.length === 1 ? `Add your ${missing.join('')} to check` : 'Add your details to check',
    reasons: missing.length === 1 ? [] : missing.map((m) => `Add your ${m} to check`),
  };
}
