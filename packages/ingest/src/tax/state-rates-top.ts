import type { StateRateEntry } from './state-rate-entry';

/** Graduated states and DC: the top bracket rate, the engine's `state_single_rate` assumption. */
const NO_YEAR = 'The page names no tax year: confirm the rate still applies to 2026.';

export const TOP: StateRateEntry[] = [
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

TOP.push(
  {
    state: 'CA',
    kind: 'top',
    percent: '12.3',
    sourceUrl: 'https://www.ftb.ca.gov/forms/2026/2026-593-instructions.html',
    quote: 'Tax Rates … Individual 12.3%',
    note: 'Form 593 (2026) withholding rate for individuals, the top bracket rate. The 1% mental health services tax on income over $1 million is not included (as with the MA surtax).',
  },
  {
    state: 'MD',
    kind: 'top',
    percent: '6.50',
    sourceUrl:
      'https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/forms/worksheets/2026-pv-worksheet.pdf',
    quote: '$1,000,001 -- $58,385.00 plus 6.50% of excess over $1,000,000',
    note: 'State rate only: Maryland county income tax is separate.',
  },
  {
    state: 'MO',
    kind: 'top',
    percent: '4.7',
    sourceUrl: 'https://dor.mo.gov/forms/MO-1040ES_2026.pdf',
    quote: '$263 plus 4.7% of excess over $9,436',
  },
  {
    state: 'MT',
    kind: 'top',
    percent: '5.65',
    sourceUrl: 'https://revenue.mt.gov/news/recent-news/2026-withholding-updates',
    quote:
      'Beginning January 1, 2026, the highest marginal tax rate will decrease from 5.9% to 5.65%',
  },
  {
    state: 'ND',
    kind: 'top',
    percent: '2.50',
    sourceUrl: 'https://www.tax.nd.gov/individual-income-tax',
    quote: 'Filing Single- If North Dakota taxable income is: … Over $244,825 … 2.50%',
    note: NO_YEAR,
  },
  {
    state: 'NE',
    kind: 'top',
    percent: '4.55',
    sourceUrl: 'https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_1040N-ES.pdf',
    quote:
      '2026 Nebraska Estimated Income Tax Rate Schedule … 1,514.58 +4.55% of the excess over $39,900',
  },
  {
    state: 'NY',
    kind: 'top',
    percent: '10.9',
    sourceUrl: 'https://www.tax.ny.gov/pdf/current_forms/it/it2105i.pdf',
    quote:
      'Single and married filing separately … 25,000,000 ................. 2,509,714 plus 10.9%',
    note: 'IT-2105 instructions, tax year 2026. 10.9% applies only above $25,000,000; NYC tax is separate.',
  },
  {
    state: 'OK',
    kind: 'top',
    percent: '4.5',
    sourceUrl:
      'https://oklahoma.gov/content/dam/ok/en/tax/documents/resources/publications/legislation/2025LegislativeUpdate.pdf',
    quote: 'HB 2764 … Tax Brackets 2026 … $7,201 and above $109.25 4.5% $7,200',
  },
  {
    state: 'WV',
    kind: 'top',
    percent: '4.58',
    sourceUrl: 'https://tax.wv.gov/Individuals/Pages/PersonalIncomeTaxReductionBill.aspx',
    quote: '2026 Income Tax Rate Cut … Over $60,000 $1,950.50 plus 4.58% of excess over $60,000',
  },
);
