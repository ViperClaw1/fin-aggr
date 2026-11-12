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

  constructor(code: string) {
    super(code);
    this.name = 'CodedError';
    this.code = code;
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

export function stageOf(error: unknown): { stage: string; code: string } {
  if (error instanceof StageFailure) return { stage: error.stage, code: error.code };
  return { stage: 'fetch', code: codeOf(error) };
}

function codeOf(error: unknown): string {
  if (error instanceof CodedError) return error.code;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'timeout';
  }
  return 'failed';
}

class StageFailure extends Error {
  readonly stage: string;
  readonly code: string;

  constructor(stage: string, code: string) {
    super(code);
    this.name = 'StageFailure';
    this.stage = stage;
    this.code = code;
  }
}

export async function guard<T>(stage: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof StageFailure) throw error;
    throw new StageFailure(stage, codeOf(error));
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
