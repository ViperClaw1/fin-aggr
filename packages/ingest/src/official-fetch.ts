import { CodedError } from './fetch-budget';

/** Two retries. The first wait is 5s, the second is 15s. */
const RETRY_DELAYS_MS = [5_000, 15_000] as const;

export interface FetchPace {
  sleep(ms: number): Promise<void>;
  now(): number;
  onAttempt?(): void;
}

function defaultPace(): FetchPace {
  return {
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  };
}

function retryAfterMs(header: string | null, now: number): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

function retryableError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function waitFor(status: number, response: Response, pace: FetchPace, attempt: number): number {
  const scheduled =
    RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 15_000;
  if (status !== 429) return scheduled;
  return retryAfterMs(response.headers.get('retry-after'), pace.now()) ?? scheduled;
}

function httpDelay(
  status: number,
  response: Response,
  pace: FetchPace,
  attempt: number,
): number | null {
  if (status !== 429 && status < 500) return null;
  return waitFor(status, response, pace, attempt);
}

export async function fetchOfficial(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  pace?: FetchPace,
): Promise<Response> {
  const step = pace ?? defaultPace();
  const attempts = RETRY_DELAYS_MS.length + 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await attemptOnce({ fetchImpl, url, init, step, attempt, attempts });
    if (response !== null) return response;
  }
  throw new CodedError('http');
}

async function attemptOnce(input: {
  fetchImpl: typeof fetch;
  url: string;
  init: RequestInit;
  step: FetchPace;
  attempt: number;
  attempts: number;
}): Promise<Response | null> {
  const { fetchImpl, url, init, step, attempt, attempts } = input;
  step.onAttempt?.();
  try {
    const response = await fetchImpl(url, init);
    if (response.ok) return response;
    const delay = httpDelay(response.status, response, step, attempt);
    if (delay === null || attempt === attempts - 1) {
      throw new CodedError(`http_${String(response.status)}`);
    }
    await step.sleep(delay);
    return null;
  } catch (error) {
    if (error instanceof CodedError) throw error;
    if (!retryableError(error) || attempt === attempts - 1) throw error;
    await step.sleep(RETRY_DELAYS_MS[attempt] ?? 15_000);
    return null;
  }
}
