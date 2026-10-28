'use client';

// "Now" for freshness labels (ADR-016 D6). Mock data counts from the data set date, so the demo
// text does not depend on the day it is viewed; real data counts from the clock. The mode comes
// from the gateway's answer, not from env: a real backend says isMock: false itself.
import type { DatasetInfo } from '@fa/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { now } from '@/shared/lib/clock';
import { datasetInfoQuery } from '../api/queries';

export const freshnessNow = (info: DatasetInfo, clock: () => Date = now): Date =>
  info.isMock ? new Date(`${info.asOf}T00:00:00Z`) : clock();

/**
 * Undefined until the answer arrives: SourceCitation then shows the absolute date. Pages prefetch
 * it on the server (ADR-016 D1), so it is there from the first render and never refetched.
 */
export function useFreshnessNow(): Date | undefined {
  const { data } = useQuery({ ...datasetInfoQuery(), staleTime: Infinity });
  return useMemo(() => (data === undefined ? undefined : freshnessNow(data)), [data]);
}
