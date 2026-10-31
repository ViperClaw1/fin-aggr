'use client';

// Document facts other than the penalty, which stays in the product terms (spec §6).
import type { DatasetInfo, Fact, FactRecord, Product } from '@fa/contracts';
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FactValue, freshnessNow } from '@/entities/fact';
import { useOpenCitation, type OpenCitation } from '@/features/open-citation';

type OnOpen = (ref: OpenCitation) => void;

function fromRecord(product: Product, record: FactRecord): Fact<string> {
  const base = product.provenance;
  return {
    value: record.valueText,
    provenance: {
      sourceId: base.sourceId,
      sourceUrl: base.sourceUrl,
      retrievedAt: base.retrievedAt,
      document: { id: record.documentId, page: record.page, quote: record.quote },
      verification:
        record.status === 'verified' && base.verification.status === 'verified'
          ? base.verification
          : { status: 'unverified' },
      isMock: record.isMock,
    },
  };
}

export function FinePrint({
  product,
  facts,
  dataset,
}: {
  product: Product;
  facts: readonly FactRecord[];
  dataset: DatasetInfo;
}) {
  const notes = facts.filter((fact) => fact.key !== 'earlyWithdrawalPenalty');
  const [onOpen, setOnOpen] = useState<OnOpen | null>(null);
  if (notes.length === 0) return null;
  const now = freshnessNow(dataset);
  return (
    <section className="mt-8 space-y-3" aria-labelledby="fine-print-heading">
      <h2 id="fine-print-heading" className="text-lg font-semibold">
        Fine print
      </h2>
      <Suspense fallback={null}>
        <OpenSync onChange={setOnOpen} />
      </Suspense>
      <dl className="space-y-3 text-sm">
        {notes.map((fact) => (
          <div key={fact.id}>
            <dt className="text-muted">{fact.humanLabel}</dt>
            <dd>
              <FactValue
                fact={fromRecord(product, fact)}
                render={(text) => text}
                now={now}
                {...(onOpen === null ? {} : { onOpenCitation: onOpen })}
              />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OpenSync({ onChange }: { onChange: (open: OnOpen) => void }) {
  const { open } = useOpenCitation();
  const openRef = useRef(open);
  useLayoutEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    // setState treats a function as an updater and would call it with null.
    onChange(() => (ref: OpenCitation) => {
      openRef.current(ref);
    });
  }, [onChange]);
  return null;
}
