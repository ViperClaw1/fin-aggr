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
  verification: z.discriminatedUnion('status', [
    z.strictObject({
      status: z.literal('verified'),
      verifiedAt: IsoDate,
      by: z.enum(['human', 'official_api']),
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
