/** Codes from Node `fetch` and socket failures. An abort is not one of them. */
const NETWORK_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function codeOf(error: object): string | null {
  if (!('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

/** A transport failure. HTTP status codes and aborts stay with the caller. */
export function isNetworkError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = codeOf(error);
  if (code !== null && NETWORK_CODES.has(code)) return true;
  if (error instanceof Error && error.message === 'fetch failed') return true;
  if ('cause' in error && error.cause !== undefined && error.cause !== error) {
    return isNetworkError(error.cause);
  }
  return false;
}

/** Runs `run` once more when the first attempt failed on the network (ADR-020). */
export async function onceOnNetworkError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    return run();
  }
}
