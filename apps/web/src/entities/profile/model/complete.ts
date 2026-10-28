// Pure views of the draft: the full Profile the engine needs, and what was filled in for the user.
import {
  formatUsd,
  isProfile,
  type Assumption,
  type Profile,
  type ProfileDraft,
} from '@fa/contracts';
import { DEFAULT_SCENARIO, DEFAULT_TAX_YEAR, REQUIRED_FIELDS } from './defaults';

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

/** The full profile with defaults filled in, or null while a required field is missing or invalid. */
export function toCompleteProfile(draft: ProfileDraft): Profile | null {
  const candidate = {
    version: 1,
    taxYear: DEFAULT_TAX_YEAR,
    cityMarginalRate: null,
    age: null,
    ...defined(draft),
    scenario: scenarioOf(draft),
  };
  // zod-free: this runs on every render (ADR-016 D3)
  return isProfile(candidate) ? candidate : null;
}

/** Values the user did not enter but the results depend on. */
export function defaultAssumptions(draft: ProfileDraft): Assumption[] {
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
  if (draft.taxYear === undefined)
    out.push({
      id: 'default_tax_year',
      text: `Tax year ${String(DEFAULT_TAX_YEAR)}.`,
      editable: true,
    });
  return out;
}

/** Only the fields eligibility reads, for toEligibilityContext on a partial profile. */
export function toEngineProfile(draft: ProfileDraft): Partial<Profile> {
  const { residency, stateCode, age, filingStatus } = draft;
  return { ...defined({ residency, stateCode, age, filingStatus }), scenario: scenarioOf(draft) };
}
