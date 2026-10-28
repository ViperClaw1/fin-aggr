// Zod-free cache-key normalizers (ADR-016 D3). The defaults are shared with the schemas in
// queries.ts, so a server prefetch and a client query build the same key (D1).

export const INSTITUTION_LIST_DEFAULTS = { limit: 25 } as const;
export const PRODUCT_LIST_DEFAULTS = { limit: 100 } as const;

type WithLimit<Q> = Omit<Q, 'limit'> & { limit: number };
interface Limited {
  limit?: number | undefined;
}

/** Defaults applied, absent optional fields left out: equal requests give equal keys. */
export const normalizeInstitutionQuery = <Q extends Limited>(q: Q): WithLimit<Q> => ({
  ...q,
  limit: q.limit ?? INSTITUTION_LIST_DEFAULTS.limit,
});

export const normalizeProductQuery = <Q extends Limited>(q: Q): WithLimit<Q> => ({
  ...q,
  limit: q.limit ?? PRODUCT_LIST_DEFAULTS.limit,
});
