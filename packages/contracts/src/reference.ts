// Reference data (spec §4). Fixture values are `unverified` until checked against official sources.
import { z } from 'zod';
import { Cents } from './money/cents';
import { Rate } from './money/rate';
import { Id, IsoDate, IsoDateTime } from './primitives';
import { FILING_STATUSES } from './profile-rules';
import { Provenance } from './provenance';
import { Regulator } from './entities';

export const FilingStatus = z.enum(FILING_STATUSES);
export type FilingStatus = z.infer<typeof FilingStatus>;

// upTo is inclusive; null on the last bracket
export const TaxBracket = z.strictObject({ upTo: Cents.nullable(), rate: Rate });
export type TaxBracket = z.infer<typeof TaxBracket>;

/** Brackets in strictly ascending `upTo`; only the last one is open-ended (`null`), and it must be. */
function bracketProblems(brackets: readonly TaxBracket[]): string[] {
  const problems: string[] = [];
  brackets.forEach((b, i) => {
    const last = i === brackets.length - 1;
    const prev = brackets[i - 1]?.upTo;
    if (last !== (b.upTo === null))
      problems.push(`bracket ${String(i)}: only the last has upTo null`);
    if (b.upTo !== null && prev !== undefined && prev !== null && b.upTo <= prev)
      problems.push(`bracket ${String(i)}: upTo must be above the previous bracket`);
  });
  return problems;
}

const TaxBrackets = z
  .array(TaxBracket)
  .min(1)
  .superRefine((brackets, ctx) => {
    for (const message of bracketProblems(brackets)) ctx.addIssue({ code: 'custom', message });
  });

export const TaxTables = z.strictObject({
  taxYear: z.int(),
  // zod 4: a record over an enum requires every filing status
  federal: z.record(FilingStatus, TaxBrackets),
  states: z.record(z.string().length(2), z.strictObject({ assumedMarginalRate: Rate })),
  provenance: Provenance,
});
export type TaxTables = z.infer<typeof TaxTables>;

export const InsuranceRules = z.strictObject({
  asOf: IsoDate,
  byRegulator: z.record(
    Regulator,
    z.strictObject({ limitPerOwnerPerInstitutionPerCategory: Cents }),
  ),
  supportedCategories: z.array(z.enum(['single', 'joint'])).min(1),
  jointOwnersAssumed: z.literal(2),
  accruedInterestCountsTowardLimit: z.literal(true),
  provenance: Provenance,
});
export type InsuranceRules = z.infer<typeof InsuranceRules>;

export const SourceRegistryEntry = z.strictObject({
  id: Id,
  name: z.string().min(1),
  url: z.url(),
  kind: z.enum(['official_api', 'official_document', 'issuer_document', 'partner_feed', 'manual']),
  license: z.string().min(1),
  lastUpdatedAt: IsoDateTime.nullable(),
  notes: z.string().optional(),
});
export type SourceRegistryEntry = z.infer<typeof SourceRegistryEntry>;

/** Version domains (ADR-019). Ads are not one of them. */
export const DATASET_DOMAINS = [
  'institutions',
  'bank_metrics',
  'products',
  'treasury',
  'reference',
  'par_yields',
  'national_rates',
  'documents',
] as const;
export type DatasetDomain = (typeof DATASET_DOMAINS)[number];

export const DatasetDomainInfo = z.strictObject({ asOf: IsoDate, isMock: z.boolean() });
export type DatasetDomainInfo = z.infer<typeof DatasetDomainInfo>;

const DatasetDomains = z.strictObject({
  institutions: DatasetDomainInfo,
  bank_metrics: DatasetDomainInfo,
  products: DatasetDomainInfo,
  treasury: DatasetDomainInfo,
  reference: DatasetDomainInfo,
  par_yields: DatasetDomainInfo,
  national_rates: DatasetDomainInfo,
  documents: DatasetDomainInfo,
});

/**
 * What the data set describes (ADR-016 D6, ADR-019). `isMock` is true only when every domain is
 * mock. `asOf` is that shared mock date, or the latest real domain date otherwise.
 */
export const DatasetInfo = z.strictObject({
  asOf: IsoDate,
  isMock: z.boolean(),
  domains: DatasetDomains,
});
export type DatasetInfo = z.infer<typeof DatasetInfo>;

/** Rollup of per-domain dates. Callers keep reading `asOf` and `isMock`. */
export function datasetRollup(domains: DatasetInfo['domains']): {
  asOf: IsoDate;
  isMock: boolean;
} {
  const rows = DATASET_DOMAINS.map((domain) => domains[domain]);
  const allMock = rows.every((row) => row.isMock);
  const dated = allMock ? rows : rows.filter((row) => !row.isMock);
  const first = dated[0];
  if (first === undefined) throw new Error('dataset has no domains');
  const asOf = dated.reduce((latest, row) => (row.asOf > latest ? row.asOf : latest), first.asOf);
  return { asOf, isMock: allMock };
}
