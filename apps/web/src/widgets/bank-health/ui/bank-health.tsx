'use client';

// Bank metrics against the market figures that arrived with the data. Nothing here is computed
// into a "market": median and mean are fields of the fact. A missing metric is "n/a", not zero.
import {
  formatPercentPoints,
  formatShare,
  formatUsdFromThousands,
  METRIC_KEYS,
  type MetricValue,
} from '@fa/contracts';
import Link from 'next/link';
import { FactValue, freshnessNow } from '@/entities/fact';
import { headlineApy } from '@/entities/product';
import { BulletChart, percentExtent } from '@/shared/ui/charts';
import { RateValue } from '@/shared/ui/rate-value';
import type { BankDetail } from '../api/load';

const METRIC_LABEL: Record<(typeof METRIC_KEYS)[number], string> = {
  tier1LeverageRatio: 'Tier 1 leverage',
  totalRiskBasedCapitalRatio: 'Total risk-based capital',
  allowanceToLoans: 'Allowance to loans',
  loansToDeposits: 'Loans to deposits',
  liquidAssetsToAssets: 'Liquid assets to assets',
  noncurrentLoansRatio: 'Noncurrent loans',
  returnOnAssets: 'Return on assets',
};

export function BankHealth({ institution, metrics, products, dataset }: BankDetail) {
  const now = freshnessNow(dataset);
  return (
    <div className="flex flex-col gap-10">
      <CallReport metrics={metrics} now={now} />
      <Products institutionName={institution.name} products={products} now={now} />
    </div>
  );
}

function CallReport({ metrics, now }: { metrics: BankDetail['metrics']; now: Date }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Call report</h2>
      {metrics === null ? (
        <p className="text-sm text-muted">No call report for this company.</p>
      ) : (
        <>
          <p>
            <FactValue
              fact={{ value: metrics.totalAssetsUsdThousands, provenance: metrics.provenance }}
              now={now}
              render={(thousands) => <>Total assets {formatUsdFromThousands(thousands)}</>}
            />
          </p>
          <p className="text-sm text-muted">As of {metrics.asOf}</p>
        </>
      )}
      <ul className="flex flex-col gap-6">
        {METRIC_KEYS.map((key) => {
          const fact = metrics?.metrics[key];
          return (
            <li key={key}>
              {fact === undefined ? (
                <p>
                  <span className="font-medium">{METRIC_LABEL[key]}</span>{' '}
                  <span className="text-muted">n/a</span>
                </p>
              ) : (
                <div className="space-y-2">
                  <FactValue
                    fact={fact}
                    now={now}
                    render={(value) =>
                      `${formatPercentPoints(value.value)}, median ${formatPercentPoints(value.marketMedian)}, mean ${formatPercentPoints(value.marketMean)}, percentile ${String(value.percentile)}`
                    }
                  />
                  <MetricChart label={METRIC_LABEL[key]} metric={fact.value} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {metrics === null ? null : (
        <div>
          <h3 className="font-medium">Balance sheet</h3>
          <FactValue
            fact={{ value: metrics.balanceSheetMix, provenance: metrics.provenance }}
            now={now}
            render={(mix) =>
              mix.map((part) => `${part.label} ${formatShare(part.share)}`).join(', ')
            }
          />
        </div>
      )}
    </section>
  );
}

function Products({
  institutionName,
  products,
  now,
}: {
  institutionName: string;
  products: BankDetail['products'];
  now: Date;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Products</h2>
      {products.length === 0 ? (
        <p className="text-sm text-muted">No products in the demo catalog.</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="mb-2 text-left font-medium">Products at {institutionName}</caption>
          <thead>
            <tr className="border-b border-divider text-left text-muted">
              <th scope="col" className="py-1 pr-3 font-medium">
                Product
              </th>
              <th scope="col" className="py-1 font-medium">
                Top APY
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-divider">
                <td className="py-2 pr-3">
                  <Link href={`/product/${product.id}`} prefetch={false} className="underline">
                    {product.name}
                  </Link>
                </td>
                <td className="py-2">
                  <FactValue
                    fact={{ value: headlineApy(product), provenance: product.provenance }}
                    now={now}
                    render={(rate) => <RateValue rate={rate} />}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function MetricChart({ label, metric }: { label: string; metric: MetricValue }) {
  const axis = percentExtent([metric.value, metric.marketMedian, metric.marketMean]);
  return (
    <BulletChart
      kind="percent"
      label={label}
      min={axis.min}
      max={axis.max}
      value={metric.value}
      marker={{ value: metric.marketMedian, label: 'Market median' }}
    />
  );
}
