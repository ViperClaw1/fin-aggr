/**
 * Rev. Proc. 2025-32 is a draft with one checker. ADR-020 requires two.
 * This function is the publisher. It does not write a version and does not change TAX_YEAR.
 */
export function publishFederalBrackets(): never {
  throw new Error('tax tables stay unpublished until a second checker confirms Rev. Proc. 2025-32');
}
