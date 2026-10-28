import type { Institution } from '@fa/contracts';

export type InstitutionKind = Institution['kind'];

// Approved for the demo on 2026-10-28. Before a launch with real data a lawyer reviews these:
// deposit insurance in advertising is regulated. Deliberately no claim about deposit insurance,
// including pass-through coverage (engine assumption).
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
