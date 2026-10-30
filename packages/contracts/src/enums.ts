// Value lists that client code reads at runtime, without zod (ADR-016). The schemas in
// entities.ts are built on them. No imports: importing a list never pulls a schema module.
export const INSTITUTION_KINDS = ['direct_bank', 'credit_union', 'fintech_partner'] as const;

/** Bank-health metrics. A missing key is shown as "n/a", never as zero. */
export const METRIC_KEYS = [
  'tier1LeverageRatio',
  'totalRiskBasedCapitalRatio',
  'allowanceToLoans',
  'loansToDeposits',
  'liquidAssetsToAssets',
  'noncurrentLoansRatio',
  'returnOnAssets',
] as const;

export const PRODUCT_CATEGORIES = [
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
] as const;

export const STAGE1_CATEGORIES = ['cd', 'savings', 'treasury'] as const;

/** Rule field names (rules.ts ProfileField), for the engine's runtime order without zod. */
export const RULE_PROFILE_FIELDS = [
  'residency',
  'stateOfResidence',
  'age',
  'filingStatus',
  'depositAmount',
] as const;
