import { fingerprintOf, readFingerprint } from '../content-hash';
import { CodedError } from '../fetch-budget';
import { fetchOfficial } from '../official-fetch';
import type { ValidationReport } from '../validate';
import type { WatchSource } from '../watch';
import {
  REGISTER_AGENCIES,
  documentsUrl,
  readRegisterPage,
  type RegisterNotice,
} from './documents';

export interface RegisterWatchRaw {
  pages: readonly { agency: string; body: string }[];
}

const PER_PAGE = 20;

function noticesOf(raw: RegisterWatchRaw): RegisterNotice[] {
  return raw.pages.flatMap((page) => readRegisterPage(page.body, page.agency));
}

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

/** Newest page from each agency. Parsing happens later, so one bad row is not a fetch failure. */
async function fetchRegisterWatch(
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<{ sha256: string; bytes: Uint8Array; body: RegisterWatchRaw; requestCount: number }> {
  const pages: { agency: string; body: string }[] = [];
  for (const agency of REGISTER_AGENCIES) {
    let response: Response;
    try {
      response = await fetchOfficial(fetchImpl, documentsUrl(agency, PER_PAGE), {
        signal,
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      if (error instanceof CodedError) throw new CodedError(error.code, agency);
      throw error;
    }
    pages.push({ agency, body: await response.text() });
  }
  return {
    ...fingerprintOf(pages.map((page) => page.body).join('\n')),
    body: { pages },
    requestCount: pages.length,
  };
}

function newRegisterNotices(previous: Uint8Array, next: RegisterWatchRaw): RegisterNotice[] {
  const seen = seenNumbers(previous);
  return noticesOf(next).filter((notice) => !seen.has(notice.documentNumber));
}

function registerIssueBody(notices: readonly RegisterNotice[]): string {
  const lines = notices.map(
    (notice) => `${notice.documentNumber} ${notice.publicationDate} ${notice.title} ${notice.url}`,
  );
  return ['Documents:', ...lines].join('\n');
}

function union(previous: Uint8Array | null, next: RegisterWatchRaw): string {
  const prior = previous === null ? [] : [...seenNumbers(previous)];
  return encode([...new Set([...prior, ...numbers(noticesOf(next))])].sort());
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
    parse: (raw) => noticesOf(raw),
    validate: emptyReport,
    changed: (previous, next) => newRegisterNotices(previous, next).length > 0,
    persist: (previous, next) => fingerprintOf(union(previous, next)),
    issueBody: (previous, next) => registerIssueBody(newRegisterNotices(previous, next)),
  };
}
