import { z } from 'zod';
import { RATE_RE, SIGNED_RATE_RE } from '../patterns';

/**
 * A rate as a decimal fraction string, 0 ≤ r ≤ 1, up to 8 decimals: "0.0435" is 4.35% (ADR-013).
 * Trailing zeros are accepted ("0.0400"); rateFromPercent produces the form without them.
 * Values that can exceed 100% are a different type, not Rate.
 */
export const Rate = z.string().regex(RATE_RE).brand<'Rate'>();
export type Rate = z.infer<typeof Rate>;

/**
 * A signed decimal fraction string with no bounds, up to 8 decimals: "-0.0123" (ADR-013).
 * Used for results such as a net yield that a penalty can push below zero. No "-0".
 */
export const SignedRate = z.string().regex(SIGNED_RATE_RE).brand<'SignedRate'>();
export type SignedRate = z.infer<typeof SignedRate>;
