import { rateFromPercent, type Rate } from '@fa/contracts';

/**
 * Draft 2026 state rates on interest income (P1.4), from state revenue department pages.
 * `none` and `flat` are exact. `top` is the top bracket rate of a graduated state, the engine's
 * `state_single_rate` assumption. Not a fixture and not published; every entry stays unverified
 * until a person confirms it. `zeroUpTo` notes a 0% band below the flat rate (the single rate
 * then overstates tax for income under it). `note` is shown before confirmation: what the quote
 * does not prove by itself.
 */

export interface StateRateDraft {
  state: string;
  kind: 'none' | 'flat' | 'top';
  /** percent as printed by the source, '0' for no tax */
  percent: string;
  sourceUrl: string;
  quote: string;
  zeroUpTo?: string;
  note?: string;
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
    // Tex. Const. art. VIII, § 24-a: a standing ban, so no tax-year page is needed
    sourceUrl: 'https://statutes.capitol.texas.gov/Docs/CN/htm/CN.8.htm',
    quote:
      "Sec. 24-a. INDIVIDUAL INCOME TAX PROHIBITED. The legislature may not impose a tax on the net incomes of individuals, including an individual's share of partnership and unincorporated association income.",
  },
];

const NO_YEAR = 'The page names no tax year: confirm the rate still applies to 2026.';

const TOP: Entry[] = [
  {
    state: 'AL',
    kind: 'top',
    percent: '5',
    sourceUrl: 'https://www.revenue.alabama.gov/wp-content/uploads/2026/01/26f40esblk.pdf',
    quote: 'Over $3000 5% Over $6000 5%',
    note: 'Form 40ES 2026 worksheet line 8c: single and joint columns.',
  },
  {
    state: 'AR',
    kind: 'top',
    percent: '3.9',
    sourceUrl: 'https://www.dfa.arkansas.gov/wp-content/uploads/withholdInstructions_2026.pdf',
    quote: 'tax rate is 3.9%.',
    note: 'Withholding instructions for 2026: confirm the sentence names the top income tax rate.',
  },
  {
    state: 'CT',
    kind: 'top',
    percent: '6.99',
    sourceUrl:
      'https://portal.ct.gov/-/media/drs/publications/pubsip/2026/ip-2026-1.pdf?rev=4482a3dca0a44b28ae39381a91fb0916&hash=57C34787EE2C1D4A7F989EE1F6B8F0F8',
    quote: 'You must begin withholding at the highest marginal rate of 6.99%',
  },
  {
    state: 'DE',
    kind: 'top',
    percent: '6.60',
    sourceUrl: 'https://revenue.delaware.gov/frequently-asked-questions/personal-income-tax-faqs/',
    quote: 'The maximum income tax rate is 6.60% on income of $60,000 or over.',
    note: NO_YEAR,
  },
  {
    state: 'DC',
    kind: 'top',
    percent: '10.75',
    sourceUrl: 'https://otr.cfo.dc.gov/page/dc-individual-and-fiduciary-income-tax-rates',
    quote:
      'The tax rates for tax years beginning after 12/31/2021 are: … Over $1,000,000 $91,525, plus 10.75% of the excess above $1,000,000.',
  },
  {
    state: 'KS',
    kind: 'top',
    percent: '5.58',
    sourceUrl: 'https://www.ksrevenue.gov/pdf/k-40es26.pdf',
    quote: '2026 KANSAS ESTIMATED TAX WORKSHEET … $1,196 plus 5.58% of excess over $23,000',
  },
  {
    state: 'ME',
    kind: 'top',
    percent: '7.15',
    sourceUrl: 'https://www.maine.gov/revenue/taxes/income-estate-tax/individual-income-tax-1040me',
    quote:
      'The income tax rates are graduated, with rates ranging from 5.8% to 7.15% for tax years beginning after 2015.',
  },
  {
    state: 'MN',
    kind: 'top',
    percent: '9.85',
    sourceUrl:
      'https://www.revenue.state.mn.us/press-release/2025-12-16/minnesota-income-tax-brackets-standard-deduction-and-dependent-exemption',
    quote: '2026 Minnesota Income Tax Brackets … Tax rate 5.35% 6.80% 7.85% 9.85%',
  },
  {
    state: 'NJ',
    kind: 'top',
    percent: '10.75',
    sourceUrl: 'https://www.nj.gov/treasury/taxation/new2020.shtml',
    quote: 'The New Jersey Gross Income Tax rate increased to 10.75% on income over $1 million.',
    note: 'A 2020 change notice: confirm no later change for 2026.',
  },
  {
    state: 'OR',
    kind: 'top',
    percent: '9.9',
    sourceUrl:
      'https://www.oregon.gov/dor/forms/FormsPubs/publication-or-estimate_101-026_2026.pdf',
    quote: 'Over $250,000 $21,237 plus 9.9% of excess over $250,000',
  },
  {
    state: 'SC',
    kind: 'top',
    percent: '5.21',
    sourceUrl: 'https://dor.sc.gov/news/information-about-h-4216',
    quote: 'The tax rate for income from $30,000 and above is 5.21%, minus $966.',
    note: 'dor.sc.gov/iit says these two rates apply "For tax year 2026".',
  },
  {
    state: 'VT',
    kind: 'top',
    percent: '8.75',
    sourceUrl: 'https://tax.vermont.gov/sites/tax/files/documents/IN-114-Instr-2026.pdf',
    quote: '2026 Preliminary Vermont Tax Rates … 256,300 - 16,601.00 8.75% 256,300',
    note: 'Preliminary 2026 rates: brackets may be adjusted, the top rate is the fact.',
  },
  {
    state: 'VA',
    kind: 'top',
    percent: '5.75',
    sourceUrl: 'https://www.individual.tax.virginia.gov/income-tax-calculator',
    quote:
      'If your taxable income is $54,000, your tax is $720 + 5.75% of the amount over $17,000.',
    note: NO_YEAR,
  },
  {
    state: 'WI',
    kind: 'top',
    percent: '7.65',
    sourceUrl: 'https://www.revenue.wi.gov/Pages/FAQS/pcs-taxrates.aspx',
    quote:
      'Wisconsin individual income tax rates vary from 3.50% to 7.65%, depending upon marital status and income.',
    note: NO_YEAR,
  },
];

/** States and DC still without a 2026 quote that covers interest income. */
export const STATE_RATES_PENDING = [
  ...['AK', 'NV', 'WA', 'WY', 'ID', 'PA', 'UT'],
  // graduated: only a 2025 page, an undated page that may be stale, or no rate on the page
  ...['CA', 'HI', 'MA', 'MD', 'MO', 'MT', 'ND', 'NE', 'NM', 'NY', 'OK', 'RI', 'WV'],
] as const;

export function stateRates2026(): StateRateDraft[] {
  return [...NONE, ...FLAT, ...TOP].map((entry) => ({
    ...entry,
    verification: { status: 'unverified' },
  }));
}

/** `ingest:confirm` id of one state's 2026 rate (ADR-025). */
export const stateFactId = (state: string): string => `tax:state-2026:${state.toLowerCase()}`;

export function stateRate(draft: StateRateDraft): Rate {
  return rateFromPercent(draft.percent);
}
