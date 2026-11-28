/**
 * ADR-026 publication policy (owner, 2026-11-26). A proposal publishes without a person only
 * when every check passed, its template has 10 institutions a person approved, and no
 * rejected sample stopped the template. Otherwise the reasons go on the review row.
 */

const HUMAN_FIRST_PER_TEMPLATE = 10;

/** All seven checks run (5 and 7 since 2026-11-28); a failure of any of them is a hold. */
export function publicationHolds(input: {
  failures: readonly string[];
  humanApproved: number;
  stopped: boolean;
}): string[] {
  const holds: string[] = [];
  if (input.failures.length > 0) holds.push(...input.failures);
  if (input.stopped) holds.push('template_stopped');
  if (input.humanApproved < HUMAN_FIRST_PER_TEMPLATE) holds.push('first_10_of_template');
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
