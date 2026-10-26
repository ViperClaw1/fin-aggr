// Sub-package '@fa/contracts/ads' (ADR-006). Not re-exported from index.ts; imported only by
// gateways, widgets/sponsored-slot and entities/sponsored (depcruise ads-contract-isolated).
import { z } from 'zod';
import { Id } from './primitives';

export const SponsoredPlacement = z.enum(['compare_top', 'compare_sidebar', 'product_aside']);
export type SponsoredPlacement = z.infer<typeof SponsoredPlacement>;

export const SponsoredItem = z.strictObject({
  id: Id,
  placement: SponsoredPlacement,
  advertiser: z.string().min(1),
  headline: z.string().min(1).max(90),
  body: z.string().max(200),
  ctaLabel: z.string().min(1),
  ctaUrl: z.url(),
  disclosure: z.string().min(10),
  compensationType: z.enum(['cpa', 'cpc', 'flat_fee']),
});
export type SponsoredItem = z.infer<typeof SponsoredItem>;
