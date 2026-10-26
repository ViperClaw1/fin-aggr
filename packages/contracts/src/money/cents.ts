import { z } from 'zod';

/** Money in integer US cents (ADR-003, ADR-013). Safe integer; negative values are allowed here. */
export const Cents = z.int().brand<'Cents'>();
export type Cents = z.infer<typeof Cents>;
