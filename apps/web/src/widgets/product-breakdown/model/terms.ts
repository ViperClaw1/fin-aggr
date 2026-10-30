// Words for the product's own terms. The numbers stay in the product; this only names them.
import {
  formatRate,
  formatUsdShort,
  type EarlyWithdrawal,
  type Product,
  type RateTier,
} from '@fa/contracts';

export const TAX_TREATMENT_LABEL: Record<Product['taxTreatment'], string> = {
  taxable: 'Taxable',
  state_local_exempt: 'Exempt from state and local income tax',
  federal_exempt: 'Exempt from federal income tax',
};

export function penaltyText(penalty: EarlyWithdrawal): string {
  switch (penalty.kind) {
    case 'none':
      return 'None';
    case 'days_of_interest':
      return `${String(penalty.days)} days of interest`;
    case 'months_of_interest':
      return `${String(penalty.months)} months of interest`;
    case 'percent_of_principal':
      return `${formatRate(penalty.rate)} of the principal`;
  }
}

export function termText(months: number | null): string {
  return months === null ? 'No term' : `${String(months)} months`;
}

export function tierRange(tier: RateTier): string {
  const min = formatUsdShort(tier.minBalance);
  return tier.maxBalance === null
    ? `${min} and up`
    : `${min} to ${formatUsdShort(tier.maxBalance)}`;
}

export function openingText(cents: Product['minOpening']): string {
  return cents === 0 ? 'No minimum' : formatUsdShort(cents);
}
