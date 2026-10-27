// Taxes on interest (spec §5 rules 6–7). Results stay unrounded; computeNetYield rounds once.
import type { Decimal } from 'decimal.js';
import type { Product, Profile, TaxBracket, TaxTables } from '@fa/contracts';
import { EngineError } from './errors';
import { D, decCents, decRate } from './money';

export type TaxProfile = Pick<
  Profile,
  'filingStatus' | 'stateCode' | 'taxableIncome' | 'cityMarginalRate'
>;

export interface TaxInput {
  tables: TaxTables;
  profile: TaxProfile;
  taxTreatment: Product['taxTreatment'];
  /** taxable interest in cents, unrounded, ≥ 0 */
  base: Decimal;
}

export interface Taxes {
  federal: Decimal;
  state: Decimal;
  local: Decimal;
  stateRate: Decimal;
  localRate: Decimal;
}

/** Progressive tax; bracket i covers (upTo[i-1], upTo[i]], so `upTo` itself is taxed at rate i. */
export function bracketTax(brackets: readonly TaxBracket[], income: Decimal): Decimal {
  let tax = new D(0);
  let lower = new D(0);
  for (const { upTo, rate } of brackets) {
    const upper = upTo === null ? null : decCents(upTo);
    const top = upper === null ? income : D.min(income, upper);
    if (top.gt(lower)) tax = tax.plus(top.minus(lower).times(decRate(rate)));
    if (upper === null || income.lte(upper)) break;
    lower = upper;
  }
  return tax;
}

function stateRate(tables: TaxTables, stateCode: string): Decimal {
  const state = tables.states[stateCode];
  if (state === undefined) throw new EngineError('invalid_input', `no tax rate for ${stateCode}`);
  return decRate(state.assumedMarginalRate);
}

export function taxesOnInterest({ tables, profile, taxTreatment, base }: TaxInput): Taxes {
  if (!base.isFinite() || base.isNeg())
    throw new EngineError('invalid_input', 'tax base must be ≥ 0');
  const income = decCents(profile.taxableIncome);
  const brackets = tables.federal[profile.filingStatus];
  const federal =
    taxTreatment === 'federal_exempt'
      ? new D(0)
      : bracketTax(brackets, income.plus(base)).minus(bracketTax(brackets, income));
  const localExempt = taxTreatment === 'state_local_exempt';
  const sRate = localExempt ? new D(0) : stateRate(tables, profile.stateCode);
  const city = profile.cityMarginalRate;
  const lRate = localExempt || city === null ? new D(0) : decRate(city);
  return {
    federal,
    state: base.times(sRate),
    local: base.times(lRate),
    stateRate: sRate,
    localRate: lRate,
  };
}
