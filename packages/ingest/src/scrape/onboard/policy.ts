/**
 * ADR-026 publication policy (owner, 2026-11-26). A proposal publishes without a person only
 * when every check passed, its template has 10 institutions a person approved, and no
 * rejected sample stopped the template. Otherwise the reasons go on the review row.
 */

const HUMAN_FIRST_PER_TEMPLATE = 10;

/**
 * Checks of ADR-026 not run yet: 5 (APY against the stated rate: the proposal carries no rate)
 * and 7 (outlier against `national_rates`: the band is the owner's number). Until both run,
 * nothing publishes automatically. Remove a name here when its check lands.
 */
const PENDING_CHECKS: readonly string[] = ['apy_rate', 'national_outlier'];

export function publicationHolds(input: {
  failures: readonly string[];
  humanApproved: number;
  stopped: boolean;
  pending?: readonly string[];
}): string[] {
  const holds: string[] = [];
  if (input.failures.length > 0) holds.push(...input.failures);
  if (input.stopped) holds.push('template_stopped');
  if (input.humanApproved < HUMAN_FIRST_PER_TEMPLATE) holds.push('first_10_of_template');
  const pending = input.pending ?? PENDING_CHECKS;
  if (pending.length > 0) holds.push(`checks_pending:${pending.join(',')}`);
  return holds;
}

/** `<kind>:<generator>` from the survey; a site without a generator meta is `unknown`. */
export function templateOf(kind: string, generator: string | null): string {
  const name = (generator ?? '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 60);
  return `${kind}:${name === '' ? 'unknown' : name}`;
}

/** Weekly sample: ceil(10%) of automated banks, a stable pick per ISO week (seed, ADR rule 5). */
export function sampleOf<T extends string>(ids: readonly T[], week: string): T[] {
  const count = Math.ceil(ids.length / 10);
  const score = (id: T): number => {
    let h = 2166136261;
    for (const ch of `${week}|${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return h;
  };
  return [...ids].sort((a, b) => score(a) - score(b) || a.localeCompare(b)).slice(0, count);
}
