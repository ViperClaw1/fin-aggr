// One labeled ad per placement. Fictional advertisers; ads never mix into organic data (ADR-006).
import { SponsoredPlacement, type SponsoredItem } from '@fa/contracts/ads';

export const sponsored = (): SponsoredItem[] =>
  SponsoredPlacement.options.map((placement, i) => ({
    id: `ad_${String(i + 1)}`,
    placement,
    advertiser: 'Northwind Savings (fictional)',
    headline: 'Open a demo savings account',
    body: 'This is a sample advertisement for the prototype.',
    ctaLabel: 'Learn more',
    ctaUrl: 'https://example.com/ads/northwind',
    disclosure: 'Sponsored. We may be paid when you click this ad.',
    compensationType: 'cpc',
  }));
