'use client';

import { useState } from 'react';
import {
  type Assumption,
  type CalcStep,
  formatUsd,
  IsoDate,
  IsoDateTime,
  parseCents,
  parseRate,
  SignedRate,
} from '@fa/contracts';
import { ExplainMath } from '@/shared/ui/explain-math';
import { FreshnessLabel } from '@/shared/ui/freshness';
import { MetricCard } from '@/shared/ui/metric-card';
import { RateValue } from '@/shared/ui/rate-value';

// Fixed, not the clock: the stand must render the same text in every run.
const NOW = new Date('2026-10-28T10:00:00Z');

// Synthetic, in the shape and wording of computeNetYield output. Not a real calculation: the
// engine needs tax tables, and the stand must not invent tax values (invariant 6).
const STEPS: CalcStep[] = [
  {
    id: 'gross',
    label: 'Gross interest',
    formula: 'amount × ((1 + APY)^(months / 12) − 1)',
    inputs: { Months: '12', Tiers: '$10,000.00 at 4.5%' },
    result: '$450.00',
  },
  {
    id: 'state',
    label: 'State tax',
    formula: 'taxable interest × state rate',
    inputs: { State: 'NY', 'State rate': '6%' },
    result: '$27.00',
  },
  {
    id: 'net',
    label: 'Net interest',
    formula: 'gross − penalty − federal − state − local',
    inputs: {},
    result: '$324.00',
  },
];
const ASSUMPTIONS: Assumption[] = [
  { id: 'niit_amt', text: 'NIIT and AMT are not included.', editable: false },
  { id: 'city_rate', text: 'City tax rate is 0%.', editable: true },
];

export function ValuesSection() {
  const [edited, setEdited] = useState('');
  return (
    <section aria-labelledby="values" className="space-y-6">
      <h2 id="values" className="text-xl font-semibold">
        Values
      </h2>
      {/* div, not p: <details> is not phrasing content and would break hydration inside <p> */}
      <div>
        Plain: <RateValue rate={parseRate('0.0435')} />. Negative:{' '}
        <RateValue rate={SignedRate.parse('-0.0312')} />. Explained:{' '}
        <RateValue
          rate={SignedRate.parse('0.0324')}
          explain="Net interest / principal, per year."
        />{' '}
        <span data-testid="after-rate">(text after the rate)</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Net interest" value={formatUsd(parseCents('324'))} hint="After taxes" />
        <MetricCard label="Capital ratio" value="8.1%" tone="warn" toneLabel="Below median" />
        <MetricCard label="Problem loans" value="4.2%" tone="danger" toneLabel="Far above median" />
      </div>
      <ul className="space-y-1">
        <li>
          <FreshnessLabel at={IsoDateTime.parse('2026-10-28T08:00:00Z')} now={NOW} />
        </li>
        <li>
          <FreshnessLabel at={IsoDate.parse('2026-09-01')} now={NOW} staleAfterDays={30} />
        </li>
      </ul>
      <ExplainMath steps={STEPS} assumptions={ASSUMPTIONS} onEditAssumption={setEdited} />
      <output data-testid="edited-assumption" className="block text-sm text-muted">
        Edited: {edited === '' ? 'none' : edited}
      </output>
    </section>
  );
}
