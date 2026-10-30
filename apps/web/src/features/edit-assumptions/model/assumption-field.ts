// Which profile field an editable assumption opens. The year has no field (one table year).
// An assumption the form cannot change (the penalty tax base) is left out, so no dead Edit button.
import type { ProfileFormField } from '@/entities/profile';

const FIELDS = {
  default_scenario: 'principal',
  city_marginal_rate: 'cityMarginalRate',
} as const satisfies Record<string, ProfileFormField>;

export function assumptionField(id: string): ProfileFormField | null {
  switch (id) {
    case 'default_scenario':
    case 'city_marginal_rate':
      return FIELDS[id];
    default:
      return null;
  }
}
