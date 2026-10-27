'use client';

import { useState } from 'react';
import { GatewayError } from '@fa/contracts';
import { EmptyState, ErrorState, Skeleton } from '@/shared/ui/states';

const RETRYABLE = new GatewayError('unavailable', 'stand: temporary outage', true);
const FINAL = new GatewayError('not_found', 'stand: missing', false);

export function StatesSection() {
  const [retries, setRetries] = useState(0);
  return (
    <section aria-labelledby="states" className="space-y-4">
      <h2 id="states" className="text-xl font-semibold">
        States
      </h2>
      <Skeleton label="Loading products" className="h-24 w-full" />
      <EmptyState title="No products match these filters">Try removing a filter.</EmptyState>
      <div data-testid="error-retryable">
        <ErrorState
          error={RETRYABLE}
          onRetry={() => {
            setRetries((n) => n + 1);
          }}
        />
        <p className="mt-1 text-muted">Retries: {retries}</p>
      </div>
      <div data-testid="error-final">
        <ErrorState error={FINAL} onRetry={() => undefined} />
      </div>
    </section>
  );
}
