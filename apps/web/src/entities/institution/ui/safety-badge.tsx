import { Disclosure } from '@/shared/ui/disclosure';
import { SAFETY_TEXT, type InstitutionKind } from '../model/safety-texts';

interface SafetyBadgeProps {
  kind: InstitutionKind;
  /** fintech_partner only: program banks, resolved by the caller. */
  partners?: readonly { id: string; name: string }[];
}

const STYLE: Record<InstitutionKind, { box: string; icon: string }> = {
  direct_bank: { box: 'border-border', icon: '🏦' },
  credit_union: { box: 'border-border', icon: '🏦' },
  fintech_partner: { box: 'border-warn bg-warn-bg text-warn', icon: '⚠' },
};

/** Kind of institution in words with an icon; the explanation opens on demand. */
export function SafetyBadge({ kind, partners = [] }: SafetyBadgeProps) {
  const text = SAFETY_TEXT[kind];
  const style = STYLE[kind];
  return (
    <div className={`inline-flex items-center rounded border px-2 py-0.5 text-sm ${style.box}`}>
      <Disclosure
        summary={
          <>
            <span aria-hidden="true">{style.icon}</span>
            <span className="font-medium">{text.title}</span>
          </>
        }
        label="What this means"
      >
        <p>{text.detail}</p>
        {partners.length === 0 ? null : (
          <p className="mt-1">Partner banks: {partners.map((b) => b.name).join(', ')}</p>
        )}
      </Disclosure>
    </div>
  );
}
