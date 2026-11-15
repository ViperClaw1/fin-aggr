import type { Provenance } from '@fa/contracts';

/** "https://www.example-bank.com/rates" → "example-bank.com". */
export const sourceDomain = (url: string): string => new URL(url).hostname.replace(/^www\./, '');

/** A scraped bank rate is cited as the bank's site, not the hostname. */
export function sourceLabel(source: Pick<Provenance, 'sourceId' | 'sourceUrl'>): string {
  if (source.sourceId.startsWith('bank:')) return 'bank website';
  return sourceDomain(source.sourceUrl);
}

/** Verification status in words: colour is never the only signal. */
export function verificationText(v: Provenance['verification']): string {
  if (v.status === 'unverified') return 'Unverified';
  return `Verified ${v.verifiedAt} (${v.by === 'human' ? 'by a person' : 'official API'})`;
}
