// The product's terms. Every rate, penalty and limit goes through FactValue (AC-3).
import type { Fact, FactRecord, Id, Product } from '@fa/contracts';
import type { ReactNode } from 'react';
import { FactValue } from '@/entities/fact';
import { RateValue } from '@/shared/ui/rate-value';
import { openingText, penaltyText, TAX_TREATMENT_LABEL, termText, tierRange } from '../model/terms';

type OnOpen = ((ref: { documentId: Id; page: number; quote: string }) => void) | undefined;

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

export function Conditions({
  product,
  facts,
  now,
  onOpen,
}: {
  product: Product;
  facts: readonly FactRecord[];
  now: Date;
  onOpen: OnOpen;
}) {
  const sourced = product.provenance;
  const open = onOpen === undefined ? {} : { onOpenCitation: onOpen };
  const extra = facts.filter((fact) => fact.key !== 'earlyWithdrawalPenalty');
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Terms</h2>
      <TierTable product={product} now={now} open={open} />
      <dl className="space-y-3 text-sm">
        <Row label="Early withdrawal penalty">
          <FactValue fact={product.earlyWithdrawal} render={penaltyText} now={now} {...open} />
        </Row>
        <Row label="Minimum to open">
          <FactValue
            fact={{ value: product.minOpening, provenance: sourced }}
            render={openingText}
            now={now}
            {...open}
          />
        </Row>
        <Row label="Term">
          <FactValue
            fact={{ value: termText(product.termMonths), provenance: sourced }}
            render={(text) => text}
            now={now}
            {...open}
          />
        </Row>
        <Row label="Tax treatment">
          <FactValue
            fact={{ value: TAX_TREATMENT_LABEL[product.taxTreatment], provenance: sourced }}
            render={(text) => text}
            now={now}
            {...open}
          />
        </Row>
        {extra.map((fact) => (
          <Row key={fact.id} label={fact.humanLabel}>
            <FactValue
              fact={fromRecord(product, fact)}
              render={(text) => text}
              now={now}
              {...open}
            />
          </Row>
        ))}
      </dl>
    </section>
  );
}

function TierTable({
  product,
  now,
  open,
}: {
  product: Product;
  now: Date;
  open: { onOpenCitation?: OnOpen };
}) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left font-medium">Rate tiers</caption>
      <thead>
        <tr className="border-b border-divider text-left text-muted">
          <th scope="col" className="py-1 pr-3 font-medium">
            Balance
          </th>
          <th scope="col" className="py-1 font-medium">
            APY
          </th>
        </tr>
      </thead>
      <tbody>
        {product.tiers.map((tier) => (
          <tr key={String(tier.minBalance)} className="border-b border-divider">
            <td className="py-2 pr-3 tabular-nums">{tierRange(tier)}</td>
            <td className="py-2">
              <FactValue
                fact={{ value: tier.apy, provenance: product.provenance }}
                render={(rate) => <RateValue rate={rate} />}
                now={now}
                {...open}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
