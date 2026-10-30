// Pure views of the draft: the full Profile the engine needs, and what was filled in for the user.
import {
  formatUsd,
  isProfile,
  type Assumption,
  type Profile,
  type ProfileDraft,
} from '@fa/contracts';
import { DEFAULT_SCENARIO, REQUIRED_FIELDS } from './defaults';

type Required = (typeof REQUIRED_FIELDS)[number];

/** Drops keys whose value is undefined, so they cannot overwrite a default when spread. */
function defined<T extends object>(value: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

const scenarioOf = (draft: ProfileDraft): Profile['scenario'] => ({
  ...DEFAULT_SCENARIO,
  ...defined(draft.scenario ?? {}),
});

export const missingFields = (draft: ProfileDraft): Required[] =>
  REQUIRED_FIELDS.filter((field) => draft[field] === undefined);

/**
 * The full profile with defaults filled in, or null while a required field is missing or invalid.
 * The calculation uses the year of the tax tables it was given (`tablesYear`, loaded at build):
 * the profile's own year never goes to the gateway (ADR-004), so another year (an imported file)
 * is calculated with the tables' year.
 */
export function toCompleteProfile(draft: ProfileDraft, tablesYear: number): Profile | null {
  const candidate = {
    version: 1,
    cityMarginalRate: null,
    age: null,
    ...defined(draft),
    taxYear: tablesYear,
    scenario: scenarioOf(draft),
  };
  // zod-free: this runs on every render (ADR-016 D3)
  return isProfile(candidate) ? candidate : null;
}

/** Values the user did not enter but the results depend on. */
export function defaultAssumptions(draft: ProfileDraft, tablesYear: number): Assumption[] {
  const out: Assumption[] = [];
  const { principal, holdingMonths } = draft.scenario ?? {};
  if (principal === undefined || holdingMonths === undefined) {
    const s = scenarioOf(draft);
    out.push({
      id: 'default_scenario',
      text: `Scenario: ${formatUsd(s.principal)} for ${String(s.holdingMonths)} months until you change it.`,
      editable: true,
    });
  }
  // null and omitted both mean "not entered": local tax is then zero, and the user can set a rate.
  if (draft.cityMarginalRate === null || draft.cityMarginalRate === undefined) {
    out.push({
      id: 'city_marginal_rate',
      text: 'City income tax rate is not set, so local tax is zero until you change it.',
      editable: true,
    });
  }
  // Always shown, never editable: there are tables for one year only, so the form has no year field.
  const missing =
    draft.taxYear === undefined || draft.taxYear === tablesYear
      ? ''
      : ` (${String(draft.taxYear)} tables not available)`;
  out.push({
    id: 'default_tax_year',
    text: `Tax year ${String(tablesYear)}${missing}.`,
    editable: false,
  });
  return out;
}

/** Only the fields eligibility reads, for toEligibilityContext on a partial profile. */
export function toEngineProfile(draft: ProfileDraft): Partial<Profile> {
  const { residency, stateCode, age, filingStatus } = draft;
  return { ...defined({ residency, stateCode, age, filingStatus }), scenario: scenarioOf(draft) };
}
