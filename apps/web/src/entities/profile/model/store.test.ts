import { Cents, ProfileDraft } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { createMigrator } from './migrate';
import { memoryBackend, type StorageLike } from './persist';
import { createProfileStore, STORAGE_KEY } from './store';

const SENTINEL_INCOME = Cents.parse(987654321);

async function hydrated(backend: StorageLike, migrate?: Parameters<typeof createProfileStore>[0]) {
  const store = createProfileStore({ backend: () => backend, ...migrate });
  await store.persist.rehydrate();
  return store;
}
const stored = (backend: StorageLike): unknown =>
  JSON.parse(backend.getItem(STORAGE_KEY) ?? 'null');

describe('persistence', () => {
  it('an update writes the versioned envelope under fa.profile', async () => {
    const backend = memoryBackend();
    const store = await hydrated(backend);
    store.getState().update({ stateCode: 'NY' });
    expect(stored(backend)).toEqual({ state: { draft: { stateCode: 'NY' } }, version: 1 });
  });
  it('a reload (a new store on the same storage) restores the draft', async () => {
    const backend = memoryBackend();
    (await hydrated(backend))
      .getState()
      .update({ stateCode: 'NY', scenario: { holdingMonths: 6 } });
    const reloaded = await hydrated(backend);
    expect([reloaded.getState().draft, reloaded.getState().hydrated]).toEqual([
      { stateCode: 'NY', scenario: { holdingMonths: 6 } },
      true,
    ]);
  });
  it('is hydrated with an empty storage', async () => {
    const store = await hydrated(memoryBackend());
    expect([store.getState().hydrated, store.getState().draft]).toEqual([true, {}]);
  });
  it('stores only the draft: no UI flags, only ProfileDraft keys (ADR-004)', async () => {
    const backend = memoryBackend();
    const store = await hydrated(backend);
    store
      .getState()
      .update({ taxableIncome: SENTINEL_INCOME, scenario: { principal: Cents.parse(5) } });
    const { state } = stored(backend) as { state: Record<string, unknown> };
    expect(Object.keys(state)).toEqual(['draft']);
    expect(ProfileDraft.safeParse(state['draft']).success).toBe(true);
  });
});

describe('a stored profile that cannot be used is discarded once', () => {
  it.each([
    ['broken JSON', '{"state":', 'corrupt'],
    ['a future version', JSON.stringify({ state: { draft: {} }, version: 2 }), 'future_version'],
    [
      'an unknown key',
      JSON.stringify({ state: { draft: { email: 'x' } }, version: 1 }),
      'invalid_shape',
    ],
    [
      'a wrong type',
      JSON.stringify({ state: { draft: { age: '40' } }, version: 1 }),
      'invalid_shape',
    ],
  ])('%s: empty draft, hydrated, reason set, key removed', async (_, raw, reason) => {
    const backend = memoryBackend({ [STORAGE_KEY]: raw });
    const s = (await hydrated(backend)).getState();
    expect([s.draft, s.hydrated, s.resetReason, backend.getItem(STORAGE_KEY)]).toEqual([
      {},
      true,
      reason,
      null,
    ]);
  });
  it('without a numeric version persist takes the state as current; the shape is still checked', async () => {
    const valid = memoryBackend({
      [STORAGE_KEY]: JSON.stringify({ state: { draft: { age: 30 } } }),
    });
    const invalid = memoryBackend({
      [STORAGE_KEY]: JSON.stringify({ state: { draft: { x: 1 } } }),
    });
    expect((await hydrated(valid)).getState().draft).toEqual({ age: 30 });
    expect((await hydrated(invalid)).getState().resetReason).toBe('invalid_shape');
  });
  it('acknowledgeReset clears the reason', async () => {
    const store = await hydrated(memoryBackend({ [STORAGE_KEY]: 'x' }));
    store.getState().acknowledgeReset();
    expect(store.getState().resetReason).toBeNull();
  });
});

describe('migration', () => {
  // a made-up v0 that called the state field "state"
  const migrate = createMigrator(
    {
      0: (draft) => {
        const { state, ...rest } = draft as { state?: string };
        return { ...rest, stateCode: state };
      },
    },
    1,
  );
  it('migrates a stored v0 draft and rewrites it as v1', async () => {
    const backend = memoryBackend({
      [STORAGE_KEY]: JSON.stringify({ state: { draft: { state: 'TX', age: 50 } }, version: 0 }),
    });
    const store = await hydrated(backend, { migrate });
    expect(store.getState().draft).toEqual({ stateCode: 'TX', age: 50 });
    expect(stored(backend)).toEqual({ state: { draft: { stateCode: 'TX', age: 50 } }, version: 1 });
  });
  it('a version with no migration step is discarded as corrupt', async () => {
    const backend = memoryBackend({
      [STORAGE_KEY]: JSON.stringify({ state: { draft: {} }, version: 0 }),
    });
    expect((await hydrated(backend)).getState().resetReason).toBe('corrupt');
  });
});

describe('actions', () => {
  it('update merges the scenario and an undefined value clears a field', async () => {
    const store = await hydrated(memoryBackend());
    const { update } = store.getState();
    update({ age: 40, scenario: { principal: Cents.parse(100) } });
    update({ age: undefined, scenario: { holdingMonths: 3 } });
    expect(store.getState().draft).toEqual({ scenario: { principal: 100, holdingMonths: 3 } });
  });
  it('rejects an invalid patch with issues and keeps the draft', async () => {
    const store = await hydrated(memoryBackend());
    store.getState().update({ stateCode: 'NY' });
    const result = store.getState().update({ scenario: { holdingMonths: 500 } });
    expect(result.ok).toBe(false);
    expect(store.getState().draft).toEqual({ stateCode: 'NY' });
  });
  it('replace swaps the whole draft', async () => {
    const store = await hydrated(memoryBackend());
    store.getState().update({ stateCode: 'NY' });
    expect(store.getState().replace({ age: 30 })).toEqual({ ok: true });
    expect(store.getState().draft).toEqual({ age: 30 });
  });
  it('clearAll leaves no stored key, and the next edit writes again', async () => {
    const backend = memoryBackend();
    const store = await hydrated(backend);
    store.getState().update({ stateCode: 'NY' });
    store.getState().clearAll();
    expect([store.getState().draft, backend.getItem(STORAGE_KEY)]).toEqual([{}, null]);
    store.getState().update({ age: 30 });
    expect(stored(backend)).toEqual({ state: { draft: { age: 30 } }, version: 1 });
  });
});

describe('storage failures', () => {
  const throwing: StorageLike = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('full', 'QuotaExceededError');
    },
    removeItem: () => undefined,
  };
  it('a failing write keeps the edit in memory and flags persistError', async () => {
    const store = await hydrated(throwing);
    expect(store.getState().update({ stateCode: 'NY' })).toEqual({ ok: true });
    expect([store.getState().draft, store.getState().persistError]).toEqual([
      { stateCode: 'NY' },
      true,
    ]);
  });
  it('blocked storage (access throws) still hydrates', async () => {
    const store = createProfileStore({
      backend: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    await store.persist.rehydrate();
    expect([store.getState().hydrated, store.getState().persistError]).toEqual([true, true]);
  });
  it('without a browser (server) the default store works in memory', () => {
    const store = createProfileStore();
    expect(store.getState().update({ stateCode: 'NY' })).toEqual({ ok: true });
    expect(store.getState().persistError).toBe(false);
  });
});
