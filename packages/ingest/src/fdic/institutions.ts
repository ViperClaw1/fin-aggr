import { Institution, type Institution as InstitutionRow } from '@fa/contracts';
import { bodyHash } from '../content-hash';
import { fetchOfficial } from '../official-fetch';
import { type Source } from '../pipeline';
import type { ValidationReport } from '../validate';

/** OpenAPI `GET /institutions`, server path `/banks` (read 2026-11-09). */
const ENDPOINT = 'https://api.fdic.gov/banks/institutions';

/** OpenAPI maximum for `limit`. */
const PAGE_SIZE = 10_000;

/** Stops a broken `meta.total` from paging forever. */
const PAGE_CAP = 20;

const FIELDS = 'CERT,NAME,STALP,WEBADDR,ACTIVE,BKCLASS';

interface FdicResponse {
  url: string;
  body: string;
}

export interface FdicInstitutionsRaw {
  retrievedAt: string;
  responses: readonly FdicResponse[];
}

interface FetchInput {
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  retrievedAt: string;
  pageSize?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function institutionsUrl(offset: number, pageSize: number): string {
  const params = new URLSearchParams({
    filters: 'ACTIVE:1',
    fields: FIELDS,
    sort_by: 'CERT',
    sort_order: 'ASC',
    limit: String(pageSize),
    offset: String(offset),
  });
  return `${ENDPOINT}?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `Array.isArray` narrows to `any[]`. The assertion puts the element back on `unknown`. */
function firstItem(value: unknown): unknown {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const items = value as readonly unknown[];
  return items[0];
}

/** One live row still has the fields the parser reads. The body is not logged. */
export function institutionEnvelopeProblems(body: unknown): string[] {
  if (!isRecord(body)) return ['page'];
  const meta = body['meta'];
  if (!isRecord(meta) || typeof meta['total'] !== 'number') return ['meta.total'];
  const first = firstItem(body['data']);
  if (first === undefined) return ['data'];
  if (!isRecord(first) || !isRecord(first['data'])) return ['data.0.data'];
  const row = first['data'];
  return ['CERT', 'NAME', 'STALP', 'ACTIVE']
    .filter((key) => !(key in row))
    .map((key) => `field ${key}`);
}

function snapshotOf(
  raw: FdicInstitutionsRaw,
  requestCount: number,
): {
  sha256: string;
  bytes: Uint8Array;
  body: FdicInstitutionsRaw;
  requestCount: number;
} {
  return { ...bodyHash(raw.responses.map((response) => response.body)), body: raw, requestCount };
}

/** Pages with `sort_by=CERT` until `meta.total`. The stored body is the response text, unchanged. */
export async function fetchFdicInstitutions(input: FetchInput): Promise<{
  sha256: string;
  bytes: Uint8Array;
  body: FdicInstitutionsRaw;
  requestCount: number;
}> {
  const pageSize = input.pageSize ?? PAGE_SIZE;
  const responses: FdicResponse[] = [];
  let offset = 0;
  let total = 0;
  let first = true;
  while (first || offset < total) {
    first = false;
    if (responses.length >= PAGE_CAP) throw new Error('fdic institutions page cap');
    const url = institutionsUrl(offset, pageSize);
    const response = await fetchOfficial(
      input.fetchImpl,
      url,
      { signal: input.signal, headers: { accept: 'application/json' } },
      input.sleep === undefined ? undefined : { sleep: input.sleep, now: () => Date.now() },
    );
    const body = await response.text();
    const page: unknown = JSON.parse(body);
    if (!isRecord(page) || !isRecord(page['meta']) || typeof page['meta']['total'] !== 'number') {
      throw new Error('fdic institutions missing total');
    }
    total = page['meta']['total'];
    const data = page['data'];
    const count = Array.isArray(data) ? data.length : 0;
    responses.push({ url, body });
    if (count === 0) break;
    offset += count;
  }
  return snapshotOf({ retrievedAt: input.retrievedAt, responses }, responses.length);
}

function certOf(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) return value;
  return null;
}

/** Call Report addresses usually have no scheme. An unparsable address is no website. */
function websiteOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return withScheme;
  } catch {
    return null;
  }
}

function rowFrom(record: Record<string, unknown>, sourceUrl: string, retrievedAt: string): unknown {
  const active = record['ACTIVE'];
  if (active !== 1 && active !== '1') return null;
  const cert = certOf(record['CERT']);
  const name = typeof record['NAME'] === 'string' ? record['NAME'].trim() : '';
  const state = typeof record['STALP'] === 'string' ? record['STALP'].trim().toUpperCase() : '';
  const charter = typeof record['BKCLASS'] === 'string' ? record['BKCLASS'] : '';
  return {
    id: cert === null ? 'fdic:' : `fdic:${cert}`,
    name,
    regulator: 'FDIC',
    kind: charter === 'CU' ? 'credit_union' : 'direct_bank',
    partnerInstitutionIds: [],
    hqState: state,
    website: websiteOf(record['WEBADDR']),
    provenance: {
      sourceId: 'fdic-institutions',
      sourceUrl,
      retrievedAt,
      verification: {
        status: 'verified',
        verifiedAt: retrievedAt.slice(0, 10),
        by: 'official_api',
      },
      isMock: false,
    },
  };
}

/**
 * Pure. Inactive rows are omitted.
 * A row that is not an `Institution` fails the run, so a partial directory is not published.
 */
export function parseFdicInstitutions(raw: FdicInstitutionsRaw): InstitutionRow[] {
  const rows: InstitutionRow[] = [];
  for (const response of raw.responses) {
    const page: unknown = JSON.parse(response.body);
    if (!isRecord(page) || !Array.isArray(page['data'])) {
      throw new Error('fdic institutions page has no data array');
    }
    for (const item of page['data']) {
      if (!isRecord(item) || !isRecord(item['data'])) {
        throw new Error('fdic institutions invalid: data');
      }
      const draft = rowFrom(item['data'], response.url, raw.retrievedAt);
      if (draft === null) continue;
      const parsed = Institution.safeParse(draft);
      if (!parsed.success) {
        throw new Error(
          `fdic institutions invalid: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
        );
      }
      rows.push(parsed.data);
    }
  }
  return rows;
}

export function validateInstitutions(
  rows: readonly unknown[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- count gate is in the pipeline, not per institution
  _previous: readonly unknown[],
): ValidationReport<InstitutionRow> {
  const clean: InstitutionRow[] = [];
  const suspicious: { key: string; reasons: string[] }[] = [];
  rows.forEach((row, index) => {
    const parsed = Institution.safeParse(row);
    if (!parsed.success) {
      const key =
        isRecord(row) && typeof row['id'] === 'string' && row['id'] !== ''
          ? row['id']
          : `row:${String(index)}`;
      suspicious.push({ key, reasons: [parsed.error.issues[0]?.message ?? 'invalid institution'] });
      return;
    }
    clean.push(parsed.data);
  });
  return { clean, suspicious, blocked: null };
}

export function fdicInstitutionsSource(
  now: () => string,
): Source<FdicInstitutionsRaw, InstitutionRow> {
  return {
    id: 'fdic-institutions',
    domain: 'institutions',
    kind: 'official_api',
    fetch: (ctx) =>
      fetchFdicInstitutions({
        fetchImpl: fetch,
        signal: ctx.signal,
        retrievedAt: now(),
      }),
    parse: parseFdicInstitutions,
    validate: validateInstitutions,
  };
}
