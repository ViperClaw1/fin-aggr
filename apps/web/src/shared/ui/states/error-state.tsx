'use client';

import { GatewayError } from '@fa/contracts';

interface ErrorStateProps {
  error: unknown;
  title?: string;
  /** Shown as a button only when the error is a retryable `GatewayError`. */
  onRetry?: () => void;
}

export function ErrorState({ error, title = 'Could not load data', onRetry }: ErrorStateProps) {
  const retryable = error instanceof GatewayError && error.retryable;
  return (
    <div role="alert" className="rounded border border-danger bg-danger-bg p-4 text-danger">
      <p className="font-medium">{title}</p>
      <p className="mt-1">
        {retryable ? 'This is usually temporary.' : 'This data is not available right now.'}
      </p>
      {retryable && onRetry !== undefined ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded bg-accent px-3 py-1.5 text-accent-foreground"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
