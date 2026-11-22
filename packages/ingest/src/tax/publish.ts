import type { Confirmation } from '../treasury/product';
import { federalBrackets2026, type FederalBracketDraft } from './federal-brackets';

/** The second checker's row in `fact_confirmations` (ADR-020: two checkers). */
export const FEDERAL_2026_FACT_ID = 'tax:federal-2026';

/**
 * Rev. Proc. 2025-32 was drafted and cross-checked against Form 1040-ES (first check). A person
 * confirms it with `pnpm ingest:confirm tax:federal-2026` (second check). Without that row this
 * throws. It does not write a version and does not change TAX_YEAR: that is a separate step.
 */
export function publishFederalBrackets(confirmation: Confirmation | undefined): Omit<
  FederalBracketDraft,
  'verification'
> & {
  verification: { status: 'verified'; verifiedAt: string; by: 'human' };
} {
  if (confirmation === undefined) {
    throw new Error(
      'tax tables stay unpublished until a second checker confirms Rev. Proc. 2025-32',
    );
  }
  return {
    ...federalBrackets2026(),
    verification: { status: 'verified', verifiedAt: confirmation.verifiedAt, by: 'human' },
  };
}
