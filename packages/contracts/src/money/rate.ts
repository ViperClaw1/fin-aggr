import { z } from 'zod';

/**
 * A rate as a decimal fraction string, 0 ≤ r ≤ 1, up to 8 decimals: "0.0435" is 4.35% (ADR-013).
 * Trailing zeros are accepted ("0.0400"); rateFromPercent produces the form without them.
 * Values that can exceed 100% are a different type, not Rate.
 */
export const Rate = z
  .string()
  .regex(/^(0(\.\d{1,8})?|1(\.0{1,8})?)$/)
  .brand<'Rate'>();
export type Rate = z.infer<typeof Rate>;
