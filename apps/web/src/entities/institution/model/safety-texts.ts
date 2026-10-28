import type { Institution } from '@fa/contracts';

export type InstitutionKind = Institution['kind'];

// DRAFT, legal wording: pending approval (CLAUDE.md "legal wording: ask"). Deliberately makes no
// claim about deposit insurance, including pass-through coverage (engine assumption).
export const SAFETY_TEXT: Record<InstitutionKind, { title: string; detail: string }> = {
  direct_bank: {
    title: 'Bank',
    detail: 'You open the account directly with this bank.',
  },
  credit_union: {
    title: 'Credit union',
    detail: 'You open the account directly with this credit union.',
  },
  fintech_partner: {
    title: 'Not a bank',
    detail:
      'This company is not a bank. Deposits are held at partner banks. Ask the company how your deposits are protected.',
  },
};
