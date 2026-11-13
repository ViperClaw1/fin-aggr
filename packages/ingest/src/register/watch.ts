import { fingerprintOf, readFingerprint } from '../content-hash';
import { CodedError } from '../fetch-budget';
import type { ValidationReport } from '../validate';
import type { WatchSource } from '../watch';
import {
  REGISTER_AGENCIES,
  documentsUrl,
  parseRegisterDocuments,
  type RegisterNotice,
} from './documents';

export interface RegisterWatchRaw {
  notices: readonly RegisterNotice[];
}

const PER_PAGE = 20;

function numbers(notices: readonly RegisterNotice[]): string[] {
  return [...new Set(notices.map((notice) => notice.documentNumber))].sort();
}

function encode(list: readonly string[]): string {
  return list.join('\n');
}

function seenNumbers(previous: Uint8Array): Set<string> {
  const text = readFingerprint(previous);
  return new Set(text === '' ? [] : text.split('\n'));
}

/** Newest page from each agency. An empty page is a normal day. */
async function fetchRegisterWatch(
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<{ sha256: string; bytes: Uint8Array; body: RegisterWatchRaw; requestCount: number }> {
  const notices: RegisterNotice[] = [];
  for (const agency of REGISTER_AGENCIES) {
    const response = await fetchImpl(documentsUrl(agency, PER_PAGE), {
      signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new CodedError(`http_${String(response.status)}`);
    notices.push(...parseRegisterDocuments(JSON.parse(await response.text()) as unknown));
  }
  const body = { notices };
  return {
    ...fingerprintOf(encode(numbers(notices))),
    body,
    requestCount: REGISTER_AGENCIES.length,
  };
}

function newRegisterNotices(previous: Uint8Array, next: RegisterWatchRaw): RegisterNotice[] {
  const seen = seenNumbers(previous);
  return next.notices.filter((notice) => !seen.has(notice.documentNumber));
}

function registerIssueBody(notices: readonly RegisterNotice[]): string {
  const lines = notices.map(
    (notice) => `${notice.documentNumber} ${notice.publicationDate} ${notice.title} ${notice.url}`,
  );
  return ['Documents:', ...lines].join('\n');
}

function union(previous: Uint8Array | null, next: RegisterWatchRaw): string {
  const prior = previous === null ? [] : [...seenNumbers(previous)];
  return encode([...new Set([...prior, ...numbers(next.notices)])].sort());
}

function emptyReport(): ValidationReport<RegisterNotice> {
  return { clean: [], suspicious: [], blocked: 'watch' };
}

export function federalRegisterSource(
  fetchImpl: typeof fetch = fetch,
): WatchSource<RegisterWatchRaw, RegisterNotice> {
  return {
    id: 'federal-register',
    domain: 'documents',
    kind: 'official_api',
    mode: 'watch',
    fetch: (ctx) => fetchRegisterWatch(fetchImpl, ctx.requestSignal()),
    parse: (raw) => [...raw.notices],
    validate: emptyReport,
    changed: (previous, next) => newRegisterNotices(previous, next).length > 0,
    persist: (previous, next) => fingerprintOf(union(previous, next)),
    issueBody: (previous, next) => registerIssueBody(newRegisterNotices(previous, next)),
  };
}
