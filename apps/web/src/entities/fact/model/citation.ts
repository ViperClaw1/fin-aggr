import type { Provenance } from '@fa/contracts';

/** "https://www.example-bank.com/rates" → "example-bank.com". */
export const sourceDomain = (url: string): string => new URL(url).hostname.replace(/^www\./, '');

/** Verification status in words: colour is never the only signal. */
export function verificationText(v: Provenance['verification']): string {
  if (v.status === 'unverified') return 'Unverified';
  return `Verified ${v.verifiedAt} (${v.by === 'human' ? 'by a person' : 'official API'})`;
}
