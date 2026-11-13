/** FDIC and NCUA share one current version. Each publish replaces only its own ids. */

export type CohortPrefix = 'fdic:' | 'ncua:';

function inCohort(id: string, prefix: CohortPrefix): boolean {
  return id.startsWith(prefix);
}

/** Rows the other regulator already published. This run does not recompute them. */
export function otherCohort<T>(
  rows: readonly T[],
  idOf: (row: T) => string,
  own: CohortPrefix,
): T[] {
  return rows.filter((row) => !inCohort(idOf(row), own));
}
