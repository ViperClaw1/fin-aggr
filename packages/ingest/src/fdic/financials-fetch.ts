import { CodedError } from '../fetch-budget';
import { bodyHash } from '../content-hash';
import { fetchOfficial } from '../official-fetch';
import { type Source } from '../pipeline';
import {
  financialFieldProblems,
  financialsProbeUrl,
  financialsShapeUrl,
  financialsUrl,
  innerObjects,
  metaTotal,
  parseFdicFinancials,
  quoted,
  reportDate,
  validateFdicFinancials,
  type CallReport,
  type FdicFinancialsRaw,
} from './financials';

const PAGE_SIZE = 2_500;
const PAGE_CAP = 20;

function snapshotOf(raw: FdicFinancialsRaw, requestCount: number) {
  return { ...bodyHash(raw.responses.map((response) => response.body)), body: raw, requestCount };
}

interface FetchInput {
  fetchImpl: typeof fetch;
  signal: AbortSignal;
  requestSignal: () => AbortSignal;
  retrievedAt: string;
  pageSize?: number;
  pause?: () => Promise<void>;
}

async function page(input: FetchInput, url: string, attempts: { count: number }): Promise<string> {
  const response = await fetchOfficial(
    input.fetchImpl,
    url,
    { signal: input.requestSignal(), headers: { accept: 'application/json' } },
    {
      sleep: input.pause ?? ((ms) => wait(ms, input.signal)),
      now: () => Date.now(),
      onAttempt: () => {
        attempts.count += 1;
      },
    },
  );
  return response.text();
}

function timeoutError(): Error {
  const error = new Error('timeout');
  error.name = 'TimeoutError';
  return error;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(timeoutError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(timeoutError());
      },
      { once: true },
    );
  });
}

/** Latest report date for one bank, then every page of that quarter. The probe is not stored. */
export async function fetchFdicFinancials(input: FetchInput) {
  const pageSize = input.pageSize ?? PAGE_SIZE;
  const attempts = { count: 0 };
  const probe = await page(input, financialsProbeUrl(), attempts);
  const compact = quoted(innerObjects(probe)[0] ?? '', 'REPDTE');
  if (compact === null || reportDate(compact) === null) throw new CodedError('date');
  const responses: { url: string; body: string }[] = [];
  let offset = 0;
  let total = 0;
  let first = true;
  while (first || offset < total) {
    first = false;
    if (responses.length >= PAGE_CAP) throw new CodedError('page_cap');
    const url = financialsUrl(compact, offset, pageSize);
    const body = await page(input, url, attempts);
    total = metaTotal(body);
    const count = innerObjects(body).length;
    responses.push({ url, body });
    if (count === 0) break;
    offset += count;
  }
  return snapshotOf({ retrievedAt: input.retrievedAt, responses }, attempts.count);
}

export function fdicFinancialsSource(
  now: () => string,
  institutionIds: ReadonlySet<string>,
): Source<FdicFinancialsRaw, CallReport> {
  let asOf = now().slice(0, 10);
  return {
    id: 'fdic-financials',
    domain: 'bank_metrics',
    kind: 'official_api',
    requestTimeoutMs: 120_000,
    fetchBudgetMs: 600_000,
    fetch: (ctx) => {
      const retrievedAt = now();
      asOf = retrievedAt.slice(0, 10);
      return fetchFdicFinancials({
        fetchImpl: fetch,
        signal: ctx.signal,
        requestSignal: () => ctx.requestSignal(),
        retrievedAt,
      });
    },
    parse: (raw) => parseFdicFinancials(raw, institutionIds),
    validate: (rows, previous) => validateFdicFinancials(rows, previous, asOf),
  };
}

export async function checkFinancialsShape(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(financialsShapeUrl(), {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return `fdic financials shape http ${String(response.status)}`;
  const problems = financialFieldProblems(await response.text());
  if (problems.length > 0) return `fdic financials shape ${problems.join(' ')}`;
  return 'fdic financials shape ok';
}
