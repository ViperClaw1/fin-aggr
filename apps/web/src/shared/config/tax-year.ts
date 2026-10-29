/**
 * Product decision: year of the tax tables the build loads; change together with fixtures.
 * Every loader (/compare, /product, /tools/after-tax-yield, /methodology) takes it from here,
 * so the pages never disagree. Not the clock: the tables exist for one year only.
 */
export const TAX_YEAR = 2026;
