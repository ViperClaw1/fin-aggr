// The only place in apps/web that touches localStorage (ADR-004, ESLint no-restricted-globals).
// Storage failures (quota, blocked storage) never reach the user's action: the profile keeps
// working in memory and `onError` reports it.

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** localStorage in a browser, null on the server. Reading it may throw (blocked storage). */
export const browserBackend = (): StorageLike | null =>
  typeof window === 'undefined' ? null : localStorage;

/** Tests and fallbacks: a Map behind the Storage methods. */
export function memoryBackend(seed: Record<string, string> = {}): StorageLike & {
  dump: () => Record<string, string>;
} {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    dump: () => Object.fromEntries(data),
  };
}

export function createGuardedStorage(
  backend: () => StorageLike | null,
  onError: (error: unknown) => void,
): StorageLike {
  function run<T>(op: (storage: StorageLike) => T, fallback: T): T {
    try {
      const storage = backend();
      return storage === null ? fallback : op(storage);
    } catch (error) {
      onError(error);
      return fallback;
    }
  }
  return {
    getItem: (key) => run((s) => s.getItem(key), null),
    setItem: (key, value) => {
      run((s) => {
        s.setItem(key, value);
      }, undefined);
    },
    removeItem: (key) => {
      run((s) => {
        s.removeItem(key);
      }, undefined);
    },
  };
}
