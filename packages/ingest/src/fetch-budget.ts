import type { DatasetDomain } from './index';

export interface FetchContext {
  /** Whole fetch. A page uses `requestSignal()` so one slow page does not spend the budget. */
  signal: AbortSignal;
  requestSignal(): AbortSignal;
}

const DEFAULT_FETCH_MS = 30_000;

/** A failure code with no URL and no payload. `stage` is added by the pipeline. */
export class CodedError extends Error {
  readonly code: string;
  /** Agency slug when the failure belongs to one Federal Register page. */
  readonly agency: string;

  constructor(code: string, agency = '') {
    super(code);
    this.name = 'CodedError';
    this.code = code;
    this.agency = agency;
  }
}

export function openFetch(timeouts: {
  requestTimeoutMs?: number;
  fetchBudgetMs?: number;
}): FetchContext {
  const budget = AbortSignal.timeout(timeouts.fetchBudgetMs ?? DEFAULT_FETCH_MS);
  const requestMs = timeouts.requestTimeoutMs ?? DEFAULT_FETCH_MS;
  return {
    signal: budget,
    requestSignal: () => AbortSignal.any([budget, AbortSignal.timeout(requestMs)]),
  };
}

export function stageOf(error: unknown): { stage: string; code: string; agency?: string } {
  if (error instanceof StageFailure) return failureOf(error.stage, error.code, error.agency);
  const agency = error instanceof CodedError ? error.agency : '';
  return failureOf('fetch', codeOf(error), agency);
}

/** Issue text. Unclassified errors are `unknown`, not a guessed transport failure. */
export function failureText(failure: { stage: string; code: string; agency?: string }): string {
  return failure.agency === undefined
    ? `${failure.stage} ${failure.code}`
    : `${failure.stage} ${failure.code} ${failure.agency}`;
}

function failureOf(
  stage: string,
  code: string,
  agency: string,
): { stage: string; code: string; agency?: string } {
  return agency === '' ? { stage, code } : { stage, code, agency };
}

function codeOf(error: unknown): string {
  if (error instanceof CodedError) return error.code;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return error.name;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string' && code !== '') return code;
  }
  return 'unknown';
}

class StageFailure extends Error {
  readonly stage: string;
  readonly code: string;
  readonly agency: string;

  constructor(stage: string, code: string, agency = '') {
    super(code);
    this.name = 'StageFailure';
    this.stage = stage;
    this.code = code;
    this.agency = agency;
  }
}

export async function guard<T>(stage: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof StageFailure) throw error;
    const agency = error instanceof CodedError ? error.agency : '';
    throw new StageFailure(stage, codeOf(error), agency);
  }
}

export function jobRecord(input: {
  source: { id: string; domain: DatasetDomain };
  startedAt: string;
  endedAt: string;
  status: 'published' | 'held' | 'failed';
  rowCount: number;
  errors: readonly string[];
  bytes: number;
  requestCount: number;
}): {
  sourceId: string;
  domain: DatasetDomain;
  startedAt: string;
  endedAt: string;
  status: 'published' | 'held' | 'failed';
  rowCount: number;
  errors: (
    { code: string } | { stage: string; code: string } | { stage: 'revalidate'; status: number }
  )[];
  bytes: number;
  requestCount: number;
} {
  return {
    sourceId: input.source.id,
    domain: input.source.domain,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    status: input.status,
    rowCount: input.rowCount,
    errors: input.errors.map((code) => ({ code })),
    bytes: input.bytes,
    requestCount: input.requestCount,
  };
}
