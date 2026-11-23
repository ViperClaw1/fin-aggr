import { rateFromPercent, type Rate } from '@fa/contracts';

/**
 * Draft 2026 state rates on interest income (P1.4), from state revenue department pages.
 * Only states where one rate is exact: no tax on interest, or a flat rate. Progressive states
 * are not here yet. Not a fixture and not published; every entry stays unverified until a
 * person confirms it. `zeroUpTo` notes a 0% band below the flat rate (the single rate then
 * overstates tax for income under it).
 */

export interface StateRateDraft {
  state: string;
  kind: 'none' | 'flat';
  /** percent as printed by the source, '0' for no tax */
  percent: string;
  sourceUrl: string;
  quote: string;
  zeroUpTo?: string;
  verification: { status: 'unverified' };
}

type Entry = Omit<StateRateDraft, 'verification'>;

const FLAT: Entry[] = [
  {
    state: 'AZ',
    kind: 'flat',
    percent: '2.5',
    sourceUrl: 'https://azdor.gov/sites/default/files/document/FORMS_INDIVIDUAL_2026_140iES.pdf',
    quote:
      'For tax year 2026 estimated tax payments, the tax rate for estimating your tax liability is 2.5%.',
  },
  {
    state: 'CO',
    kind: 'flat',
    percent: '4.4',
    sourceUrl: 'https://tax.colorado.gov/sites/tax/files/documents/DR_0104EP_2026.pdf',
    quote: 'Estimated 2026 Colorado income tax — 4.4% of line 1',
  },
  {
    state: 'GA',
    kind: 'flat',
    percent: '4.99',
    sourceUrl: 'https://dor.georgia.gov/taxes/important-tax-updates',
    quote: 'The Georgia income tax rate has been reduced to a flat rate of 4.99%.',
  },
  {
    state: 'IL',
    kind: 'flat',
    percent: '4.95',
    sourceUrl:
      'https://tax.illinois.gov/forms/withholding/currentyear/il-700-t-withholding-guide-tables.html',
    quote: 'Effective January 1, 2026, Tax Rate 4.95%',
  },
  {
    state: 'IN',
    kind: 'flat',
    percent: '2.95',
    sourceUrl: 'https://www.in.gov/dor/resources/tax-rates-and-reports/rates-fees-and-penalties/',
    quote: 'The Indiana Individual adjusted gross income tax rate for 2026 is 2.95%',
  },
  {
    state: 'IA',
    kind: 'flat',
    percent: '3.8',
    sourceUrl:
      'https://revenue.iowa.gov/press-release/2025-10-21/idr-announces-2026-individual-income-tax-and-interest-rates',
    quote: 'Iowa law provides for a flat tax rate of 3.8 percent.',
  },
  {
    state: 'KY',
    kind: 'flat',
    percent: '3.5',
    sourceUrl: 'https://revenue.ky.gov/Forms/2026%20Withholding%20Formula.pdf',
    quote: '3.5% Kentucky flat tax rate',
  },
  {
    state: 'LA',
    kind: 'flat',
    percent: '3',
    sourceUrl:
      'https://revenue.louisiana.gov/tax-education-and-faqs/faqs/income-tax-reform/what-are-the-individual-income-tax-rates-and-brackets/',
    quote:
      'For taxable periods beginning on or after January 1, 2025, the individual income tax rate is a flat 3%.',
  },
  {
    state: 'MI',
    kind: 'flat',
    percent: '4.25',
    sourceUrl:
      'https://www.michigan.gov/treasury/reference/taxpayer-notices/2026/04/15/425-income-tax-rate-for-individuals-and-fiduciaries-in-2026-tax-year',
    quote: 'the rate in effect under Section 51 for the 2026 tax year is 4.25%',
  },
  {
    state: 'MS',
    kind: 'flat',
    percent: '4.0',
    sourceUrl:
      'https://www.dor.ms.gov/sites/default/files/business/Computer%20Payroll%20Flowchart%20-%20updated%208-13-25.pdf',
    quote: 'If TI is greater than $10,000, then TAX is 4.0% of TI in excess of $10,000.',
    zeroUpTo: '$10,000',
  },
  {
    state: 'NC',
    kind: 'flat',
    percent: '3.99',
    sourceUrl: 'https://www.ncdor.gov/taxes-forms/individual-income-tax/tax-rate-schedules',
    quote: 'For Taxable Years after 2025, the North Carolina individual income tax rate is 3.99%',
  },
  {
    state: 'OH',
    kind: 'flat',
    percent: '2.75',
    sourceUrl: 'https://tax.ohio.gov/individual/who-must-file/whats-new',
    quote:
      'For tax year 2026, the highest tax rate applied to taxable nonbusiness income has been reduced to 2.75%.',
    // ponytail: threshold taken from the 2025 schedule; confirm the 2026 figure before publishing
    zeroUpTo: '$26,050',
  },
];

const NONE: Entry[] = [
  {
    state: 'FL',
    kind: 'none',
    percent: '0',
    sourceUrl: 'https://floridarevenue.com/faq/Pages/FAQDetails.aspx?FAQID=1466',
    quote: 'Florida does not impose a personal income tax, so there are no filing requirements.',
  },
  {
    state: 'NH',
    kind: 'none',
    percent: '0',
    sourceUrl: 'https://www.revenue.nh.gov/taxes-glance/interest-dividends-tax',
    quote:
      'Effective for taxable periods beginning after December 31, 2024, the Interest and Dividends tax is repealed.',
  },
  {
    state: 'SD',
    kind: 'none',
    percent: '0',
    sourceUrl: 'https://dor.sd.gov/individuals/taxes/',
    quote: 'South Dakota is one of seven states that does not impose a state income tax.',
  },
  {
    state: 'TN',
    kind: 'none',
    percent: '0',
    sourceUrl: 'https://www.tn.gov/revenue/taxes/hall-income-tax.html',
    quote:
      'The Hall Income tax was repealed for tax periods that begin on January 1, 2021, or later.',
  },
  {
    state: 'TX',
    kind: 'none',
    percent: '0',
    sourceUrl: 'https://star.comptroller.texas.gov/view/9109L1132A13',
    quote: 'Texas does not have a personal income tax.',
  },
];

/** Single-rate states still without a 2026 quote that covers interest income. */
export const STATE_RATES_PENDING = ['AK', 'NV', 'WA', 'WY', 'ID', 'PA', 'UT'] as const;

export function stateRates2026(): StateRateDraft[] {
  return [...NONE, ...FLAT].map((entry) => ({ ...entry, verification: { status: 'unverified' } }));
}

/** `ingest:confirm` id of one state's 2026 rate (ADR-025). */
export const stateFactId = (state: string): string => `tax:state-2026:${state.toLowerCase()}`;

export function stateRate(draft: StateRateDraft): Rate {
  return rateFromPercent(draft.percent);
}
