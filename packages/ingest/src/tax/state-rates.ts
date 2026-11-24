import { rateFromPercent, type Rate } from '@fa/contracts';
import type { StateRateEntry } from './state-rate-entry';
import { TOP } from './state-rates-top';

/**
 * Draft 2026 state rates on interest income (P1.4), from state revenue department pages.
 * `none` and `flat` are exact. `top` is the top bracket rate of a graduated state, the engine's
 * `state_single_rate` assumption. Not a fixture and not published; every entry stays unverified
 * until a person confirms it. `zeroUpTo` notes a 0% band below the flat rate (the single rate
 * then overstates tax for income under it). `note` is shown before confirmation: what the quote
 * does not prove by itself.
 */

export type StateRateDraft = StateRateEntry & { verification: { status: 'unverified' } };

type Entry = StateRateEntry;

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
  {
    // 5% on interest; the 4% surtax above $1,107,750 is left out (owner's call, 2026-11-23)
    state: 'MA',
    kind: 'flat',
    percent: '5.00',
    sourceUrl: 'https://www.mass.gov/info-details/tax-rates',
    quote:
      'Long term capital gains from dividends, interest, wages, and other income 5.00% Tax year 2026: For income exceeding $1,107,750, there is an additional surtax of 4%.',
    note: 'The 4% surtax on income over $1,107,750 is not included: the rate is 5% for everyone.',
  },
  {
    state: 'PA',
    kind: 'flat',
    percent: '3.07',
    sourceUrl:
      'https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax',
    quote:
      'Pennsylvania personal income tax is levied at the rate of 3.07 percent against taxable income of resident and nonresident individuals',
    note: 'The page names no tax year: confirm the rate still applies to 2026. The same page lists interest as one of the eight taxable classes.',
  },
  {
    state: 'UT',
    kind: 'flat',
    percent: '4.5',
    sourceUrl: 'https://incometax.utah.gov/file-pay/tax-rates/',
    quote: 'January 1, 2025 – current 4.5% or .045',
    note: 'The page is headed "2025 Utah Income Tax"; "current" covers 2026 only if no 2026 law changed the rate. Read 2026-11-24.',
  },
  {
    state: 'ID',
    kind: 'flat',
    percent: '5.3',
    sourceUrl: 'https://legislature.idaho.gov/statutesrules/idstat/Title63/T63CH30/SECT63-3024/',
    quote:
      'The tax imposed upon individuals, trusts, and estates shall be computed at the rate of five and three-tenths percent (5.3%) of taxable income over two thousand five hundred dollars ($2,500).',
    zeroUpTo: '$2,500',
    note: 'Idaho Code 63-3024(2)(a) as read 2026-11-24; the section text names no tax year. The Tax Commission rate schedule shows a $4,811 single zero band for 2025: confirm which threshold applies to 2026.',
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
  {
    state: 'NV',
    kind: 'none',
    percent: '0',
    // Nev. Const. art. 10, § 1(9): a standing ban, like Texas
    sourceUrl: 'https://www.leg.state.nv.us/const/nvconst.html',
    quote: 'No income tax shall be levied upon the wages or personal income of natural persons.',
  },
  {
    state: 'AK',
    kind: 'none',
    percent: '0',
    // AS 43.20.012(a)(1): the Alaska Net Income Tax Act does not apply to individuals
    sourceUrl:
      'https://www.akleg.gov/basis/statutes.asp?media=print&secStart=43.20.012&secEnd=43.20.012',
    quote: '(a) The tax imposed by this chapter does not apply to (1) an individual;',
    note: 'The quote shows the state net income tax excludes individuals; it is not a constitutional ban and can change by statute.',
  },
  {
    state: 'WA',
    kind: 'none',
    percent: '0',
    sourceUrl:
      'https://dor.wa.gov/taxes-rates/other-taxes/capital-gains-tax/frequently-asked-questions-about-washingtons-capital-gains-tax',
    quote:
      'Many mutual fund distributions are distributions of interest or dividends, which are not subject to Washington’s capital gains tax.',
    note: 'Washington taxes long-term capital gains of individuals (RCW 82.87.040), not interest. The quote says interest is outside that tax; it does not itself state that no other tax reaches interest.',
  },
  {
    state: 'WY',
    kind: 'none',
    percent: '0',
    sourceUrl: 'https://wyoleg.gov/LSOResearch/2003/03sr001.pdf',
    quote:
      'Wyoming is one of just seven states that do not impose an individual income tax at the state level',
    note: 'Legislative Service Office report from October 2003, not a statute: no Wyoming law imposes the tax, so there is nothing to cite directly. Confirm nothing has changed since.',
  },
];

/** States and DC still without a 2026 quote that covers interest income. */
export const STATE_RATES_PENDING = [] as const;

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
