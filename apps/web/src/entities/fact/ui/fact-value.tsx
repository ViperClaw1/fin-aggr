import type { Fact } from '@fa/contracts';
import type { ReactNode } from 'react';
import { Disclosure } from '@/shared/ui/disclosure';
import { verificationText } from '../model/citation';
import { SourceCitation, type SourceCitationProps } from './source-citation';

export interface FactValueProps<T> {
  /** A Fact always carries its provenance, so a value cannot render without a source. */
  fact: Fact<T>;
  render: (value: T) => ReactNode;
  onOpenCitation?: SourceCitationProps['onOpen'];
  now?: Date;
  /**
   * Table cell: the value and a dot for its verification status; the source, status, demo mark and
   * freshness open on click or Enter (T3). The status is in the toggle's name, not only its colour.
   */
  compact?: boolean;
  /** compact only: open the panel from the right edge, for an end-aligned column */
  align?: 'start' | 'end';
}

/** `data-citation` marks a sourced value for the AC-3 e2e check. */
export function FactValue<T>({
  fact,
  render,
  onOpenCitation,
  now,
  compact = false,
  align = 'start',
}: FactValueProps<T>) {
  const citation = (
    <SourceCitation
      provenance={fact.provenance}
      variant="inline"
      {...(onOpenCitation ? { onOpen: onOpenCitation } : {})}
      {...(now ? { now } : {})}
    />
  );
  if (compact) {
    const verified = fact.provenance.verification.status !== 'unverified';
    return (
      <div className="inline-block" data-citation={fact.provenance.sourceId}>
        <Disclosure
          align={align}
          icon={false}
          label={`${verificationText(fact.provenance.verification)}, show source`}
          summary={
            <>
              <span className="font-medium tabular-nums">{render(fact.value)}</span>
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${verified ? 'bg-ok' : 'bg-warn'}`}
              />
            </>
          }
        >
          {citation}
        </Disclosure>
      </div>
    );
  }
  return (
    <div
      className="inline-flex flex-wrap items-baseline gap-2"
      data-citation={fact.provenance.sourceId}
    >
      <span className="tabular-nums">{render(fact.value)}</span>
      {citation}
    </div>
  );
}
