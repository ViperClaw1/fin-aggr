import { describe, expect, it, vi } from 'vitest';
import { startProfileHydration, type HydrationTarget } from './hydrate';
import { hasStoredProfile, memoryBackend } from './persist';
import { STORAGE_KEY } from './store';

function target(): HydrationTarget & { rehydrate: ReturnType<typeof vi.fn> } {
  return {
    setState: vi.fn(),
    rehydrate: vi.fn(() => Promise.resolve()),
  };
}

describe('profile hydration scheduling', () => {
  it('does not rehydrate when nothing is stored', async () => {
    const store = target();
    await startProfileHydration(store, false, () => {
      throw new Error('schedule should not run');
    });
    expect(store.setState).toHaveBeenCalledWith({ hydrated: true });
    expect(store.rehydrate).not.toHaveBeenCalled();
  });

  it('rehydrates only from the idle schedule when a profile is stored', async () => {
    const store = target();
    const queued: { task: (() => void) | null } = { task: null };
    const pending = startProfileHydration(store, true, (task) => {
      queued.task = task;
    });
    expect(store.rehydrate).not.toHaveBeenCalled();
    const task = queued.task;
    if (task === null) throw new Error('idle task was not scheduled');
    task();
    await pending;
    expect(store.rehydrate).toHaveBeenCalledOnce();
    expect(store.setState).not.toHaveBeenCalled();
  });
});

describe('hasStoredProfile', () => {
  it('is false when the key is missing and true when an envelope is stored', () => {
    expect(hasStoredProfile(memoryBackend())).toBe(false);
    expect(hasStoredProfile(memoryBackend({ [STORAGE_KEY]: '{}' }))).toBe(true);
  });

  it('is false when storage throws', () => {
    const blocked: Parameters<typeof hasStoredProfile>[0] = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(hasStoredProfile(blocked)).toBe(false);
  });
});
