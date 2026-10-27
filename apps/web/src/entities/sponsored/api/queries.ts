// Ads stay in their own slice and contract (ADR-006); organic queries never see them.
import type { SponsoredPlacement } from '@fa/contracts/ads';
import { queryOptions } from '@tanstack/react-query';
import { getGateway } from '@/shared/api';
import { STALE_TIME } from '@/shared/lib/query-client';

export const sponsoredQuery = (placement: SponsoredPlacement) =>
  queryOptions({
    queryKey: ['sponsored', placement] as const,
    queryFn: () => getGateway().listSponsored(placement),
    staleTime: STALE_TIME.sponsored,
  });
