// Ads for a placement, loaded at build time like the catalog (E5 decision 4, ADR-016 D1): inside
// 'use cache' the result joins the static shell, so the client loads no gateway and no zod for
// them, and the slot does not appear after hydration (no layout shift).
import type { SponsoredItem, SponsoredPlacement } from '@fa/contracts/ads';
import { sponsoredQuery } from '@/entities/sponsored/queries';
import { makeQueryClient } from '@/shared/lib/query-client';

export async function loadSponsored(placement: SponsoredPlacement): Promise<SponsoredItem[]> {
  'use cache';
  return makeQueryClient().query(sponsoredQuery(placement));
}
