'use client';

import { useState } from 'react';
import { type Fact, parseRate, Provenance, type Rate, formatRate } from '@fa/contracts';
import type { EligibilityResult } from '@fa/engine';
import { FactValue, SourceCitation } from '@/entities/fact';
import { SafetyBadge } from '@/entities/institution';
import { CompatibilityBadge } from '@/entities/rule';

const NOW = new Date('2026-10-28T10:00:00Z');

// Synthetic provenance in every variant; example.org/.com are reserved demo domains.
const WITH_DOC = Provenance.parse({
  sourceId: 'stand_doc',
  sourceUrl: 'https://www.example.com/disclosures/cd.pdf',
  retrievedAt: '2026-10-27T12:00:00Z',
  document: { id: 'doc_stand_1', page: 3, quote: 'Early withdrawal penalty: 90 days of interest.' },
  verification: { status: 'verified', verifiedAt: '2026-10-20', by: 'human' },
  isMock: true,
});
const WITHOUT_DOC = Provenance.parse({
  sourceId: 'stand_web',
  sourceUrl: 'https://rates.example.org/savings',
  retrievedAt: '2026-08-01T00:00:00Z',
  verification: { status: 'unverified' },
  isMock: true,
});
const APY: Fact<Rate> = { value: parseRate('0.0435'), provenance: WITH_DOC };

const ELIGIBLE: EligibilityResult = {
  status: 'eligible',
  missingFields: [],
  trace: { path: '$', op: 'and', result: true, children: [] },
};
const INELIGIBLE: EligibilityResult = {
  status: 'ineligible',
  missingFields: [],
  trace: {
    path: '$',
    op: 'and',
    result: false,
    children: [
      { path: '$.args[0]', label: 'Not available in NY', op: 'not', result: false, children: [] },
      {
        path: '$.args[1]',
        label: 'Minimum opening deposit',
        field: 'depositAmount',
        op: 'gte',
        result: false,
        actual: 50000,
        expected: 100000,
      },
    ],
  },
};
const NEEDS_PROFILE: EligibilityResult = {
  status: 'needs_profile',
  missingFields: ['age'],
  trace: { path: '$', field: 'age', op: 'gte', result: 'unknown', expected: 18 },
};

export function EntitiesSection() {
  const [opened, setOpened] = useState('none');
  return (
    <section aria-labelledby="entities" className="space-y-6">
      <h2 id="entities" className="text-xl font-semibold">
        Entities
      </h2>
      <div data-testid="fact">
        <FactValue
          fact={APY}
          render={formatRate}
          now={NOW}
          onOpenCitation={(ref) => {
            setOpened(`${ref.documentId} p${String(ref.page)}: ${ref.quote}`);
          }}
        />
      </div>
      <output data-testid="opened-citation" className="block text-sm break-all text-muted">
        Opened: {opened}
      </output>
      <div data-testid="citation-web">
        <SourceCitation provenance={WITHOUT_DOC} />
      </div>
      <div className="flex flex-wrap gap-3">
        <SafetyBadge kind="direct_bank" />
        <SafetyBadge kind="credit_union" />
        <SafetyBadge
          kind="fintech_partner"
          partners={[
            { id: 'p1', name: 'Alder Savings' },
            { id: 'p2', name: 'Birch Bank' },
          ]}
        />
      </div>
      <div className="space-y-3" data-testid="eligibility">
        <CompatibilityBadge result={ELIGIBLE} />
        <CompatibilityBadge result={INELIGIBLE} />
        <CompatibilityBadge result={NEEDS_PROFILE} compact />
      </div>
    </section>
  );
}
