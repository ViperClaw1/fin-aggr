import { describe, expect, it, vi } from 'vitest';
import { createMigrator, ProfileVersionError } from './migrate';
import { createGuardedStorage, memoryBackend, type StorageLike } from './persist';

const failing = (name: string): StorageLike => {
  const boom = (): never => {
    throw new DOMException(name, name);
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
};

describe('createGuardedStorage', () => {
  it('passes reads and writes through', () => {
    const backend = memoryBackend();
    const guarded = createGuardedStorage(() => backend, vi.fn());
    guarded.setItem('k', 'v');
    expect([guarded.getItem('k'), backend.dump()]).toEqual(['v', { k: 'v' }]);
    guarded.removeItem('k');
    expect(guarded.getItem('k')).toBeNull();
  });
  it.each(['QuotaExceededError', 'SecurityError'])('never throws on %s and reports it', (name) => {
    const onError = vi.fn();
    const guarded = createGuardedStorage(() => failing(name), onError);
    guarded.setItem('k', 'v');
    guarded.removeItem('k');
    expect(guarded.getItem('k')).toBeNull();
    expect(onError).toHaveBeenCalledTimes(3);
  });
  it('without a backend (server) does nothing and reports nothing', () => {
    const onError = vi.fn();
    const guarded = createGuardedStorage(() => null, onError);
    guarded.setItem('k', 'v');
    expect([guarded.getItem('k'), onError.mock.calls.length]).toEqual([null, 0]);
  });
});

describe('createMigrator', () => {
  const steps = {
    0: (d: unknown) => ({ ...(d as object), a: 1 }),
    1: (d: unknown) => ({ ...(d as object), b: 2 }),
  };
  const migrate = createMigrator(steps, 2);
  const codeOf = (fn: () => unknown): string | undefined => {
    try {
      fn();
    } catch (e) {
      if (e instanceof ProfileVersionError) return e.code;
      throw e;
    }
    return undefined;
  };
  it('runs every step from the stored version up to the current one, in order', () => {
    expect([migrate({}, 0), migrate({}, 1), migrate({ z: 0 }, 2)]).toEqual([
      { a: 1, b: 2 },
      { b: 2 },
      { z: 0 },
    ]);
  });
  it('rejects a future version, a gap in the table and a non-integer version', () => {
    expect(codeOf(() => migrate({}, 3))).toBe('future');
    expect(codeOf(() => createMigrator({ 1: steps[1] }, 2)({}, 0))).toBe('missing_step');
    expect(codeOf(() => migrate({}, 1.5))).toBe('missing_step');
  });
});
