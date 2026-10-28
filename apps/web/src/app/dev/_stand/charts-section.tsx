import { parseCents, parseRate } from '@fa/contracts';
import { BulletChart } from '@/shared/ui/charts';

// Synthetic: the limit is a round demo number, not a real insurance limit (invariant 6).
const LIMIT = parseCents('100,000');

export function ChartsSection() {
  return (
    <section aria-labelledby="charts" className="space-y-6">
      <h2 id="charts" className="text-xl font-semibold">
        BulletChart
      </h2>
      <div data-testid="bullet-below">
        <BulletChart
          kind="usd"
          label="Balance at Alder Savings"
          max={parseCents('150,000')}
          value={parseCents('60,000')}
          marker={{ value: LIMIT, label: 'Demo limit' }}
        />
      </div>
      <div data-testid="bullet-at">
        <BulletChart
          kind="usd"
          label="Balance at Birch Bank"
          max={LIMIT}
          value={LIMIT}
          marker={{ value: LIMIT, label: 'Demo limit' }}
        />
      </div>
      <div data-testid="bullet-over">
        <BulletChart
          kind="usd"
          label="Balance at Cedar Credit"
          max={LIMIT}
          value={parseCents('130,000')}
          marker={{ value: LIMIT, label: 'Demo limit' }}
          overflowText="Over by $30,000.00"
        />
      </div>
      <div data-testid="bullet-rate">
        <BulletChart
          kind="rate"
          label="Capital ratio (synthetic)"
          max={parseRate('0.2')}
          value={parseRate('0.081')}
          marker={{ value: parseRate('0.095'), label: 'Market median' }}
          bands={[
            { upTo: parseRate('0.06'), label: 'Low' },
            { upTo: parseRate('0.12'), label: 'Typical' },
            { upTo: parseRate('0.2'), label: 'High' },
          ]}
        />
      </div>
    </section>
  );
}
