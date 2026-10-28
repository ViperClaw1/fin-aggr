// Net yield after penalty and taxes (spec §5 computeNetYield, rules 1–9).
import type { Decimal } from 'decimal.js';
import {
  FILING_STATUS_LABEL,
  formatRate,
  formatSignedRate,
  formatUsd,
  type Assumption,
  type CalcStep,
  type Cents,
  type SignedRate,
  type TaxTables,
} from '@fa/contracts';
import { EngineError } from './errors';
import { computeInterest, DAYS_PER_YEAR, type Interest, type YieldProduct } from './interest';
import { D, decCents, toCents, toSignedRate } from './money';
import { taxesOnInterest, type Taxes, type TaxProfile } from './tax';

export interface NetYieldInput {
  product: YieldProduct;
  principal: Cents;
  /** fewer than termMonths means closing early */
  holdingMonths: number;
  profile: TaxProfile;
  tables: TaxTables;
}

export interface NetYieldResult {
  grossInterest: Cents;
  earlyWithdrawalPenalty: Cents;
  taxableInterest: Cents;
  federalTax: Cents;
  stateTax: Cents;
  localTax: Cents;
  /** negative when the penalty is larger than the interest */
  netInterest: Cents;
  /** netInterest / principal × 12 / holdingMonths */
  netSimpleAnnualYield: SignedRate;
  steps: readonly CalcStep[];
  assumptions: readonly Assumption[];
  warnings: readonly string[];
}

type Lines = Omit<NetYieldResult, 'netSimpleAnnualYield' | 'steps' | 'assumptions' | 'warnings'>;

const A = {
  niitAmt: {
    id: 'niit_amt_ignored',
    text: 'Net investment income tax, AMT and phase-outs of deductions are not included.',
    editable: false,
  },
  penaltyBase: {
    id: 'penalty_reduces_taxable_interest',
    text: 'The early withdrawal penalty reduces taxable interest.',
    editable: true,
  },
  simpleYield: {
    id: 'simple_annual_yield',
    text: 'Yield is simple annual: net interest / principal × 12 / months held, no compounding.',
    editable: false,
  },
  roundingPerLine: {
    id: 'rounding_per_line',
    text: 'Each line is rounded to the cent separately, so a line may differ by one cent from its shown inputs.',
    editable: false,
  },
  treasury: {
    id: 'treasury_effective_yield',
    text: 'Treasury interest is modeled as an equivalent effective annual yield.',
    editable: false,
  },
  dayCount: {
    id: 'day_count_365',
    text: `A penalty in days is simple interest on a ${String(DAYS_PER_YEAR)}-day year; months are 1/12 of a year.`,
    editable: false,
  },
} as const satisfies Record<string, Assumption>;

const WARN_NOT_RENEWED = 'The rate is not renewed after the term: interest stops at maturity.';
const WARN_NEGATIVE = 'The early withdrawal penalty is larger than the interest earned.';

function assumptionsFor(product: YieldProduct): Assumption[] {
  return [
    A.niitAmt,
    A.penaltyBase,
    A.simpleYield,
    A.roundingPerLine,
    ...(product.category === 'treasury' ? [A.treasury] : []),
    ...(product.earlyWithdrawal.kind === 'days_of_interest' ? [A.dayCount] : []),
  ];
}

const usd = (cents: Cents): string => formatUsd(cents);

// Step texts are shown to the user as is (ExplainMath), so codes become words here.
const TIER_MODE: Record<YieldProduct['tierMode'], string> = {
  whole_balance: 'Whole balance earns the APY of its tier',
  marginal: 'Each portion earns the APY of its own tier',
};
const PENALTY: Record<YieldProduct['earlyWithdrawal']['kind'], string> = {
  none: 'No early withdrawal penalty',
  days_of_interest: 'Days of interest at the account APY',
  months_of_interest: 'Months of interest at the account APY',
  percent_of_principal: 'Percent of the principal',
};

type Row = [
  id: string,
  label: string,
  formula: string,
  inputs: Record<string, string>,
  result: string,
];

interface StepsInput {
  input: NetYieldInput;
  interest: Interest;
  taxes: Taxes;
  lines: Lines;
  yld: SignedRate;
}

const pct = (d: Decimal): string => `${d.times(100).toString()}%`;

function taxRows(profile: TaxProfile, taxes: Taxes, lines: Lines): Row[] {
  return [
    [
      'federal',
      'Federal tax',
      'tax(income + interest) − tax(income)',
      {
        'Taxable income': usd(profile.taxableIncome),
        'Filing status': FILING_STATUS_LABEL[profile.filingStatus],
      },
      usd(lines.federalTax),
    ],
    [
      'state',
      'State tax',
      'taxable interest × state rate',
      { State: profile.stateCode, 'State rate': pct(taxes.stateRate) },
      usd(lines.stateTax),
    ],
    [
      'local',
      'Local tax',
      'taxable interest × city rate',
      { 'City rate': pct(taxes.localRate) },
      usd(lines.localTax),
    ],
  ];
}

function stepsFor({ input, interest, taxes, lines, yld }: StepsInput): CalcStep[] {
  const { principal, holdingMonths, profile, product } = input;
  const tiers = interest.portions
    .map((p) => `${usd(toCents(p.amount))} at ${formatRate(p.apy)}`)
    .join('; ');
  const rows: Row[] = [
    [
      'tiers',
      'Rate tiers',
      'principal split across the APY tiers',
      { Principal: usd(principal), 'Tier mode': TIER_MODE[product.tierMode] },
      tiers,
    ],
    [
      'gross',
      'Gross interest',
      'amount × ((1 + APY)^(months / 12) − 1)',
      { Months: String(interest.months), Tiers: tiers },
      usd(lines.grossInterest),
    ],
    [
      'penalty',
      'Early withdrawal penalty',
      interest.closedEarly ? PENALTY[product.earlyWithdrawal.kind] : 'None: held to term',
      { 'Months held': String(holdingMonths) },
      usd(lines.earlyWithdrawalPenalty),
    ],
    [
      'taxable',
      'Taxable interest',
      'max(0, gross interest − penalty)',
      {
        'Gross interest': usd(lines.grossInterest),
        Penalty: usd(lines.earlyWithdrawalPenalty),
      },
      usd(lines.taxableInterest),
    ],
    ...taxRows(profile, taxes, lines),
    [
      'net',
      'Net interest',
      'gross − penalty − federal − state − local',
      {},
      usd(lines.netInterest),
    ],
    [
      'yield',
      'Net simple annual yield',
      'net interest / principal × 12 / months held',
      { Principal: usd(principal), 'Months held': String(holdingMonths) },
      formatSignedRate(yld),
    ],
  ];
  return rows.map(([id, label, formula, inputs, result]) => ({
    id,
    label,
    formula,
    inputs,
    result,
  }));
}

export function computeNetYield(input: NetYieldInput): NetYieldResult {
  const { product, principal, holdingMonths, profile, tables } = input;
  if (decCents(principal).lte(0)) throw new EngineError('invalid_input', 'principal must be > 0');
  const interest = computeInterest(product, principal, holdingMonths);
  const base = D.max(0, interest.gross.minus(interest.penalty));
  const taxes = taxesOnInterest({ tables, profile, taxTreatment: product.taxTreatment, base });
  const grossInterest = toCents(interest.gross);
  const earlyWithdrawalPenalty = toCents(interest.penalty);
  const federalTax = toCents(taxes.federal);
  const stateTax = toCents(taxes.state);
  const localTax = toCents(taxes.local);
  // each line is rounded once; the total is their exact difference, so the shown lines add up
  const netInterest = toCents(
    [earlyWithdrawalPenalty, federalTax, stateTax, localTax].reduce(
      (acc, c) => acc.minus(decCents(c)),
      decCents(grossInterest),
    ),
  );
  const lines: Lines = {
    grossInterest,
    earlyWithdrawalPenalty,
    taxableInterest: toCents(base),
    federalTax,
    stateTax,
    localTax,
    netInterest,
  };
  const yld = toSignedRate(
    decCents(netInterest).div(decCents(principal)).times(12).div(holdingMonths),
  );
  return {
    ...lines,
    netSimpleAnnualYield: yld,
    steps: stepsFor({ input, interest, taxes, lines, yld }),
    assumptions: assumptionsFor(product),
    warnings: [
      ...(interest.cappedAtTerm ? [WARN_NOT_RENEWED] : []),
      ...(netInterest < 0 ? [WARN_NEGATIVE] : []),
    ],
  };
}
