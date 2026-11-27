import { z } from 'zod';
import { Id, IsoDate, IsoDateTime } from './primitives';

/** Where a shown fact comes from (ADR-007). Strict: fixtures may not carry extra keys. */
export const Provenance = z.strictObject({
  sourceId: Id,
  sourceUrl: z.url(),
  retrievedAt: IsoDateTime,
  document: z
    .strictObject({
      id: Id,
      page: z.int().positive(),
      quote: z.string().min(1).max(400),
    })
    .optional(),
  /** The ZIP our request carried when the page priced by ZIP (ADR-022). Never a user's ZIP. */
  requestZip: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  verification: z.discriminatedUnion('status', [
    z.strictObject({
      status: z.literal('verified'),
      verifiedAt: IsoDate,
      /** `automated_check`: every ADR-026 check passed and no person looked (additive). */
      by: z.enum(['human', 'official_api', 'automated_check']),
    }),
    z.strictObject({ status: z.literal('unverified') }),
  ]),
  isMock: z.boolean(),
});
export type Provenance = z.infer<typeof Provenance>;

/** Schema of a value that cannot be shown without its source. */
export function fact<S extends z.ZodType>(
  value: S,
): z.ZodObject<{ value: S; provenance: typeof Provenance }, z.core.$strict> {
  return z.strictObject({ value, provenance: Provenance });
}

export interface Fact<T> {
  readonly value: T;
  readonly provenance: Provenance;
}
