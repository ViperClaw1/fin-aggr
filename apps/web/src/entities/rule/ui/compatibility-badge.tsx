import type { EligibilityResult } from '@fa/engine';
import { Disclosure } from '@/shared/ui/disclosure';
import { explainEligibility } from '../model/explain-eligibility';

export interface CompatibilityBadgeProps {
  result: EligibilityResult;
  /** Table cell: icon and headline, reasons on demand. */
  compact?: boolean;
}

const STYLE = {
  eligible: { icon: '✓', cls: 'text-ok' },
  ineligible: { icon: '✕', cls: 'text-danger' },
  needs_profile: { icon: '?', cls: 'text-warn' },
} as const;

export function CompatibilityBadge({ result, compact = false }: CompatibilityBadgeProps) {
  const { status, headline, reasons } = explainEligibility(result);
  const style = STYLE[status];
  const head = (
    <span className={`inline-flex items-center gap-1 font-medium ${style.cls}`}>
      <span aria-hidden="true">{style.icon}</span>
      {headline}
    </span>
  );
  if (reasons.length === 0) return head;
  const list = (
    <ul className="list-disc pl-5 text-sm">
      {reasons.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  );
  if (compact) {
    return (
      <Disclosure summary={head} label="Why">
        {list}
      </Disclosure>
    );
  }
  return (
    <div>
      {head}
      {list}
    </div>
  );
}
