// Spec §4 s-maxage, expressed as a cacheLife revalidate, plus one cache tag per version domain.
import type { DatasetDomain } from '@fa/contracts';
import { cacheLife, cacheTag } from 'next/cache';

export const CACHE_REVALIDATE = {
  institutions: 3600,
  bankMetrics: 86400,
  products: 900,
  documents: 86400,
  facts: 900,
  tax: 604800,
  insurance: 86400,
  sources: 3600,
  meta: 3600,
  ads: 60,
} as const;

export function cacheFor(revalidate: number, ...domains: readonly DatasetDomain[]): void {
  cacheLife({ revalidate });
  for (const domain of domains) cacheTag(domain);
}
