import { z } from 'zod';

/** Calendar date "YYYY-MM-DD"; zod's ISO date also rejects impossible days ("2026-02-31"). */
export const IsoDate = z.iso.date().brand<'IsoDate'>();
export type IsoDate = z.infer<typeof IsoDate>;

/** ISO date-time with an explicit offset ("2026-10-26T12:00:00Z" or "+02:00"). */
export const IsoDateTime = z.iso.datetime({ offset: true }).brand<'IsoDateTime'>();
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Opaque identifier: "fdic:628", "prod_cd_0042". */
export const Id = z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,63}$/i);
export type Id = z.infer<typeof Id>;
