import { fingerprintOf, readFingerprint } from '../content-hash';
import { CodedError } from '../fetch-budget';
import type { ValidationReport } from '../validate';
import type { WatchSource } from '../watch';
import { ecfrFingerprint, versionsUrl } from './parts';

export interface EcfrWatchRaw {
  part: string;
  amendmentDate: string;
  identifiers: string;
}

const PARTS = ['328', '330', '745'] as const;
type EcfrPart = (typeof PARTS)[number];

const PART_URL: Record<EcfrPart, string> = {
  '328': 'https://www.ecfr.gov/current/title-12/chapter-III/subchapter-B/part-328',
  '330': 'https://www.ecfr.gov/current/title-12/chapter-III/subchapter-B/part-330',
  '745': 'https://www.ecfr.gov/current/title-12/chapter-VII/subchapter-A/part-745',
};

function canonical(raw: EcfrWatchRaw): string {
  return `${raw.part}|${raw.amendmentDate}|${raw.identifiers}`;
}

function isPart(value: string): value is EcfrPart {
  return PARTS.some((part) => part === value);
}

/** Versions JSON only. The part title is not stored and is not part of the hash. */
async function fetchEcfrWatch(
  part: EcfrPart,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<{ sha256: string; bytes: Uint8Array; body: EcfrWatchRaw; requestCount: number }> {
  const response = await fetchImpl(versionsUrl(part), {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new CodedError(`http_${String(response.status)}`);
  const stamp = ecfrFingerprint(JSON.parse(await response.text()) as unknown);
  if (stamp.part !== part) throw new CodedError('part');
  const body: EcfrWatchRaw = stamp;
  return { ...fingerprintOf(canonical(body)), body, requestCount: 1 };
}

function ecfrIssueBody(raw: EcfrWatchRaw): string {
  const lines = [
    `Part: ${raw.part}`,
    `Date: ${raw.amendmentDate}`,
    `Sections: ${raw.identifiers}`,
    `Link: ${isPart(raw.part) ? PART_URL[raw.part] : ''}`,
  ];
  if (raw.part === '330' || raw.part === '745') {
    lines.push('Recheck the SMDIA and SMSIA quotes before changing the insurance limit.');
  }
  return lines.join('\n');
}

function emptyReport(): ValidationReport<EcfrWatchRaw> {
  return { clean: [], suspicious: [], blocked: 'watch' };
}

export function ecfrWatchSource(
  part: EcfrPart,
  fetchImpl: typeof fetch = fetch,
): WatchSource<EcfrWatchRaw, EcfrWatchRaw> {
  const source: WatchSource<EcfrWatchRaw, EcfrWatchRaw> = {
    id: `ecfr-${part}`,
    domain: 'reference',
    kind: 'official_api',
    mode: 'watch',
    fetch: (ctx) => fetchEcfrWatch(part, fetchImpl, ctx.requestSignal()),
    parse: (raw) => [raw],
    validate: emptyReport,
    changed: (previous, next) => readFingerprint(previous) !== canonical(next),
    persist: (_previous, next) => fingerprintOf(canonical(next)),
    issueBody: (_previous, next) => ecfrIssueBody(next),
  };
  return source;
}
