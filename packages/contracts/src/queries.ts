// Request schemas (spec §4). Strict and free of Profile fields (ADR-004); never import profile.ts.
import { z } from 'zod';
import { InstitutionKind, ProductCategory } from './entities';
import { Id } from './primitives';

export function Page<S extends z.ZodType>(
  item: S,
): z.ZodObject<{ items: z.ZodArray<S>; nextCursor: z.ZodNullable<z.ZodString> }, z.core.$strict> {
  return z.strictObject({ items: z.array(item), nextCursor: z.string().nullable() });
}
export interface PageOf<T> {
  items: T[];
  nextCursor: string | null;
}

const Limit = z.int().min(1).max(100);

export const InstitutionQuery = z.strictObject({
  q: z.string().max(80).optional(),
  kind: InstitutionKind.optional(),
  limit: Limit.default(25),
  cursor: z.string().optional(),
});

export const ProductQuery = z.strictObject({
  category: ProductCategory,
  institutionId: Id.optional(),
  limit: Limit.default(100),
  cursor: z.string().optional(),
});

export const FactQuery = z
  .strictObject({ documentId: Id.optional(), productId: Id.optional() })
  .refine((q) => q.documentId !== undefined || q.productId !== undefined, {
    error: 'documentId or productId required',
  });
