import { formatSignedRate, type Rate, type SignedRate } from '@fa/contracts';
import type { ReactNode } from 'react';
import { RateExplain } from './rate-explain';

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
  const text = formatSignedRate(rate);
  if (explain === undefined) return <span className="tabular-nums">{text}</span>;
  return (
    <RateExplain text={text} label={explainLabel}>
      {explain}
    </RateExplain>
  );
}
