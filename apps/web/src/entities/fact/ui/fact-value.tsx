import type { Fact } from '@fa/contracts';
import type { ReactNode } from 'react';
import { SourceCitation, type SourceCitationProps } from './source-citation';

export interface FactValueProps<T> {
  /** A Fact always carries its provenance, so a value cannot render without a source. */
  fact: Fact<T>;
  render: (value: T) => ReactNode;
  onOpenCitation?: SourceCitationProps['onOpen'];
  now?: Date;
}

/** `data-citation` marks a sourced value for the AC-3 e2e check. */
export function FactValue<T>({ fact, render, onOpenCitation, now }: FactValueProps<T>) {
  return (
    <div
      className="inline-flex flex-wrap items-baseline gap-2"
      data-citation={fact.provenance.sourceId}
    >
      <span className="tabular-nums">{render(fact.value)}</span>
      <SourceCitation
        provenance={fact.provenance}
        variant="inline"
        {...(onOpenCitation ? { onOpen: onOpenCitation } : {})}
        {...(now ? { now } : {})}
      />
    </div>
  );
}
