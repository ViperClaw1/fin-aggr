// Value lists that client code reads at runtime, without zod (ADR-016). The schemas in
// entities.ts are built on them. No imports: importing a list never pulls a schema module.
export const INSTITUTION_KINDS = ['direct_bank', 'credit_union', 'fintech_partner'] as const;

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
