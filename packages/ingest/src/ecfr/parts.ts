/** eCFR versioner v1, title 12. Field names checked against the API on 2026-11-10. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface EcfrPartStamp {
  part: string;
  /** Section identifiers on `latest_amendment_date`, sorted. */
  identifier: string;
  amendmentDate: string;
  title: string;
}

export function versionsUrl(part: string): string {
  const params = new URLSearchParams({ part });
  return `https://www.ecfr.gov/api/versioner/v1/versions/title-12.json?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One versions response still has the fields the watch reads. */
export function ecfrVersionsProblems(body: unknown): string[] {
  if (!isRecord(body)) return ['body'];
  const meta = body['meta'];
  if (!isRecord(meta)) return ['meta'];
  const problems: string[] = [];
  if (typeof meta['part'] !== 'string' || meta['part'] === '') problems.push('meta.part');
  if (
    typeof meta['latest_amendment_date'] !== 'string' ||
    !DATE.test(meta['latest_amendment_date'])
  ) {
    problems.push('meta.latest_amendment_date');
  }
  if (!Array.isArray(body['content_versions']) || body['content_versions'].length === 0) {
    problems.push('content_versions');
  }
  return problems;
}

function latestIdentifiers(versions: readonly unknown[], amendmentDate: string): string {
  const ids = new Set<string>();
  for (const item of versions) {
    if (!isRecord(item) || item['amendment_date'] !== amendmentDate) continue;
    const identifier = item['identifier'];
    if (typeof identifier !== 'string' || identifier === '')
      throw new Error('ecfr versions invalid');
    ids.add(identifier);
  }
  if (ids.size === 0) throw new Error('ecfr versions invalid');
  return [...ids].sort().join(',');
}

function versionList(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('ecfr versions invalid');
  return value as readonly unknown[];
}

function versionFields(versions: unknown): {
  part: string;
  amendmentDate: string;
  versions: readonly unknown[];
} {
  const problems = ecfrVersionsProblems(versions);
  if (problems.length > 0) throw new Error(`ecfr versions invalid: ${problems.join(' ')}`);
  if (!isRecord(versions) || !isRecord(versions['meta'])) throw new Error('ecfr versions invalid');
  const part = versions['meta']['part'];
  const amendmentDate = versions['meta']['latest_amendment_date'];
  if (typeof part !== 'string' || typeof amendmentDate !== 'string') {
    throw new Error('ecfr versions invalid');
  }
  return {
    part,
    amendmentDate,
    versions: versionList(versions['content_versions']),
  };
}

function partTitle(structure: unknown, part: string): string {
  if (!isRecord(structure) || structure['type'] !== 'part')
    throw new Error('ecfr structure invalid');
  const identifier = structure['identifier'];
  const title = structure['label_description'];
  if (typeof identifier !== 'string' || identifier !== part)
    throw new Error('ecfr structure invalid');
  if (typeof title !== 'string' || title === '') throw new Error('ecfr structure invalid');
  return title;
}

/**
 * Pure. The stamp is the part id, the sections touched on the latest amendment date,
 * that date, and the part title. It is not a published dollar amount.
 */
/** Amendment date plus the section ids touched on that date, sorted. The title is not included. */
export function ecfrFingerprint(versions: unknown): {
  part: string;
  amendmentDate: string;
  identifiers: string;
} {
  const fields = versionFields(versions);
  return {
    part: fields.part,
    amendmentDate: fields.amendmentDate,
    identifiers: latestIdentifiers(fields.versions, fields.amendmentDate),
  };
}

export function parseEcfrPart(versions: unknown, structure: unknown): EcfrPartStamp {
  const fields = versionFields(versions);
  return {
    part: fields.part,
    identifier: latestIdentifiers(fields.versions, fields.amendmentDate),
    amendmentDate: fields.amendmentDate,
    title: partTitle(structure, fields.part),
  };
}

/** A fixed line. The new date and title stay out of the log until a review row exists. */
export function ecfrWatchLine(recorded: EcfrPartStamp, next: EcfrPartStamp): string {
  const same =
    recorded.part === next.part &&
    recorded.identifier === next.identifier &&
    recorded.amendmentDate === next.amendmentDate;
  return same ? `ecfr ${next.part} unchanged` : `ecfr ${next.part} changed`;
}
