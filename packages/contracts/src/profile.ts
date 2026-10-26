// Client-only (ADR-004): never imported by gateway.ts or queries.ts (depcruise profile-never-in-gateway-types).
import { z } from 'zod';
import { Cents } from './money/cents';
import { Rate } from './money/rate';
import { FilingStatus } from './reference';

export const Profile = z.strictObject({
  version: z.literal(1),
  taxYear: z.int(),
  filingStatus: FilingStatus,
  stateCode: z.string().length(2),
  taxableIncome: Cents, // before this interest
  cityMarginalRate: Rate.nullable(), // entered by hand
  residency: z.enum(['us_citizen', 'us_resident', 'nonresident']),
  age: z.int().min(0).max(120).nullable(),
  scenario: z.strictObject({ principal: Cents, holdingMonths: z.int().min(1).max(120) }),
});
export type Profile = z.infer<typeof Profile>;
