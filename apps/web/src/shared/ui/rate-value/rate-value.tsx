import { formatRateDisplay, type Rate, type SignedRate } from '@fa/contracts';
import type { ReactNode } from 'react';
import { Disclosure } from '../disclosure';

interface RateValueProps {
  rate: Rate | SignedRate;
  /** "How is this calculated?" content; without it the value is plain text. */
  explain?: ReactNode;
  explainLabel?: string;
}

/** Formats only. A bank's rate is a fact and goes through FactValue (spec §6 rule 1). */
export function RateValue({
  rate,
  explain,
  explainLabel = 'How is this calculated?',
}: RateValueProps) {
  const text = formatRateDisplay(rate);
  if (explain === undefined) return <span className="tabular-nums">{text}</span>;
  return (
    <Disclosure summary={text} label={explainLabel}>
      {explain}
    </Disclosure>
  );
}
