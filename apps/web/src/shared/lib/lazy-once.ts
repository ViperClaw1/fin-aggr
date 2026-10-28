/**
 * Runs `load` once and shares the result. Only a success is cached: after a rejection (a failed
 * chunk load) the next call tries again instead of returning the same error forever (ADR-016).
 */
export function lazyOnce<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | null = null;
  return () => {
    loading ??= load().catch((error: unknown) => {
      loading = null;
      throw error;
    });
    return loading;
  };
}
