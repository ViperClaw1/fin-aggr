// TanStack Query client (ADR-008, ADR-009). Freshness per resource follows the s-maxage column of
// the REST cache table in spec §4; retries only for errors the gateway marks retryable.
import { GatewayError } from '@fa/contracts';
import { environmentManager, QueryClient } from '@tanstack/react-query';
import { cache } from 'react';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const STALE_TIME = {
  institutions: HOUR,
  bankMetrics: DAY,
  products: 15 * MINUTE,
  documents: DAY,
  facts: 15 * MINUTE,
  taxTables: 7 * DAY,
  insuranceRules: DAY,
  sources: HOUR,
  sponsored: MINUTE,
} as const;

const MAX_RETRIES = 2;

/** `failureCount` is the number of failures so far, so at most MAX_RETRIES retries follow. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return error instanceof GatewayError && error.retryable && failureCount < MAX_RETRIES;
}

/** 1 s, 2 s, 4 s … capped at 8 s. */
export const backoff = (attempt: number): number => Math.min(1000 * 2 ** attempt, 8000);

export function makeQueryClient({
  retryDelay = backoff,
}: { retryDelay?: number | ((attempt: number) => number) } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry, retryDelay } },
  });
}

// one client per server request; one for the whole browser session
const serverClient = cache(() => makeQueryClient());
let browserClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return serverClient();
  browserClient ??= makeQueryClient();
  return browserClient;
}
