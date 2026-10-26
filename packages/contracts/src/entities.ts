// Organic entities (spec §4). No commercial fields here (ADR-006); every object is strict.
import { z } from 'zod';
import { Cents } from './money/cents';
import { Rate } from './money/rate';
import { Id, IsoDate } from './primitives';
import { fact, Provenance } from './provenance';
import { Rule } from './rules';

export const Regulator = z.enum(['FDIC', 'NCUA']);
export const InstitutionKind = z.enum(['direct_bank', 'credit_union', 'fintech_partner']);

export const Institution = z.strictObject({
  id: Id, // 'fdic:<cert>' or 'ncua:<charter>'
  name: z.string().min(1),
  regulator: Regulator,
  kind: InstitutionKind,
  partnerInstitutionIds: z.array(Id), // fintech_partner: the program banks; otherwise []
  hqState: z.string().length(2),
  website: z.url().nullable(),
  provenance: Provenance,
});
export type Institution = z.infer<typeof Institution>;

export const MetricKey = z.enum([
  'tier1LeverageRatio',
  'totalRiskBasedCapitalRatio',
  'allowanceToLoans',
  'loansToDeposits',
  'liquidAssetsToAssets',
  'noncurrentLoansRatio',
  'returnOnAssets',
]);
export type MetricKey = z.infer<typeof MetricKey>;

// Percent values for display against the market; no money arithmetic on them.
export const MetricValue = z.strictObject({
  value: z.number(),
  marketMedian: z.number(),
  marketMean: z.number(),
  percentile: z.number().min(0).max(100),
});

export const BankMetrics = z.strictObject({
  institutionId: Id,
  asOf: IsoDate,
  totalAssetsUsdThousands: z.int().nonnegative(),
  // a missing metric is shown as "n/a", never invented
  metrics: z.partialRecord(MetricKey, fact(MetricValue)),
  balanceSheetMix: z.array(
    z.strictObject({ label: z.string().min(1), share: z.number().min(0).max(1) }),
  ),
  provenance: Provenance,
});
export type BankMetrics = z.infer<typeof BankMetrics>;

export const ProductCategory = z.enum([
  'cd',
  'savings',
  'money_market',
  'treasury',
  'muni',
  'credit_card',
  'mortgage',
  'auto_loan',
  'personal_loan',
  'refinance',
]);
export type ProductCategory = z.infer<typeof ProductCategory>;
export const STAGE1_CATEGORIES = ['cd', 'savings', 'treasury'] as const;

const NonNegativeCents = Cents.refine((v) => v >= 0, { error: 'Must not be negative' });

export const RateTier = z
  .strictObject({
    minBalance: NonNegativeCents,
    maxBalance: NonNegativeCents.nullable(),
    apy: Rate,
  })
  .refine((t) => t.maxBalance === null || t.maxBalance >= t.minBalance, {
    error: 'maxBalance must be >= minBalance',
  });
export type RateTier = z.infer<typeof RateTier>;

export const EarlyWithdrawal = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('days_of_interest'), days: z.int().positive() }),
  z.strictObject({ kind: z.literal('months_of_interest'), months: z.int().positive() }),
  z.strictObject({ kind: z.literal('percent_of_principal'), rate: Rate }),
]);
export type EarlyWithdrawal = z.infer<typeof EarlyWithdrawal>;

const ProductShape = z.strictObject({
  id: Id,
  institutionId: Id,
  category: ProductCategory,
  name: z.string().min(1),
  termMonths: z.int().positive().nullable(), // null: no term
  tierMode: z.enum(['whole_balance', 'marginal']),
  tiers: z.array(RateTier).min(1),
  compounding: z.enum(['daily', 'monthly', 'quarterly', 'semiannual', 'annual', 'at_maturity']),
  minOpening: NonNegativeCents,
  maxDeposit: NonNegativeCents.nullable(),
  earlyWithdrawal: fact(EarlyWithdrawal), // with document, page and quote
  eligibility: Rule,
  taxTreatment: z.enum(['taxable', 'state_local_exempt', 'federal_exempt']),
  validFrom: IsoDate,
  validTo: IsoDate.nullable(),
  provenance: Provenance,
});
type ProductShape = z.infer<typeof ProductShape>;

/** Tiers sorted by minBalance, non-overlapping; only the last one may be open-ended. */
function tierProblems(tiers: readonly RateTier[]): string[] {
  const problems: string[] = [];
  tiers.forEach((tier, i) => {
    const next = tiers[i + 1];
    if (next === undefined) return;
    if (tier.maxBalance === null) problems.push(`tier ${String(i)} is open-ended but not last`);
    else if (next.minBalance <= tier.maxBalance)
      problems.push(`tier ${String(i + 1)} overlaps or precedes tier ${String(i)}`);
  });
  return problems;
}

/** Cross-field invariants not expressible per field (spec §4 + E1 plan). */
function productProblems(p: ProductShape): string[] {
  const problems = tierProblems(p.tiers);
  if (p.validTo !== null && p.validTo < p.validFrom) problems.push('validTo is before validFrom');
  if (p.maxDeposit !== null && p.maxDeposit < p.minOpening)
    problems.push('maxDeposit is below minOpening');
  const needsTerm = p.category === 'cd' || p.category === 'treasury';
  if (needsTerm && p.termMonths === null) problems.push(`${p.category} requires termMonths`);
  if (p.category === 'savings' && p.termMonths !== null) problems.push('savings has no termMonths');
  return problems;
}

export const Product = ProductShape.superRefine((p, ctx) => {
  for (const message of productProblems(p)) ctx.addIssue({ code: 'custom', message });
});
export type Product = z.infer<typeof Product>;

export const DocumentMeta = z.strictObject({
  id: Id,
  title: z.string().min(1),
  publisherInstitutionId: Id.nullable(),
  pages: z.int().positive(),
  fileUrl: z.string().min(1),
  publishedAt: IsoDate.nullable(),
  isSynthetic: z.boolean(),
});
export type DocumentMeta = z.infer<typeof DocumentMeta>;

export const FactRecord = z.strictObject({
  id: Id,
  productId: Id.nullable(),
  documentId: Id,
  key: z.enum([
    'earlyWithdrawalPenalty',
    'achWithdrawalLimit',
    'monthlyFee',
    'minBalanceForApy',
    'rateChangePolicy',
  ]),
  humanLabel: z.string().min(1),
  valueText: z.string().min(1),
  page: z.int().positive(),
  quote: z.string().min(1).max(400),
  status: z.enum(['verified', 'unverified']),
  isMock: z.boolean(),
});
export type FactRecord = z.infer<typeof FactRecord>;
