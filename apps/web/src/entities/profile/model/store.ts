// The profile store (ADR-004, ADR-009): a draft persisted in this browser only. Hydration is manual
// (skipHydration) so the static shell renders without a profile; HydrateProfile starts it.
// The schema loads lazily on hydration (ADR-016 D5); until it has loaded, edits are rejected and
// nothing is written, so a failed load never overwrites the stored profile.
import type { ProfileDraft } from '@fa/contracts';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import { loadProfileSchema, type CheckDraft, type SchemaLoader } from './load-schema';
import { CURRENT_VERSION, migrateDraft, ProfileVersionError, type Migrator } from './migrate';
import { PROFILE_STORAGE_KEY } from '@/shared/config';
import { browserBackend, createGuardedStorage, type StorageLike } from './persist';

export const STORAGE_KEY = PROFILE_STORAGE_KEY;

/** Why a stored profile was discarded; shown once, never persisted. */
type ResetReason = 'corrupt' | 'future_version' | 'invalid_shape';
export type ActionResult = { ok: true } | { ok: false; issues: readonly string[] };

export interface ProfileState {
  draft: ProfileDraft;
  hydrated: boolean;
  resetReason: ResetReason | null;
  /** storage failed (quota, blocked): the profile lives in memory for this session */
  persistError: boolean;
  /** the schema chunk failed to load: the stored profile is kept but not shown; retried on reload */
  loadError: boolean;
  /** merges into the draft; an undefined value clears that field */
  update: (patch: ProfileDraft) => ActionResult;
  replace: (draft: ProfileDraft) => ActionResult;
  /** "Erase everything": empty draft and no stored key */
  clearAll: () => void;
  acknowledgeReset: () => void;
}

interface Options {
  backend?: () => StorageLike | null;
  migrate?: Migrator;
  loadSchema?: SchemaLoader;
}

class SchemaLoadError extends Error {
  constructor(cause: unknown) {
    super('profile schema failed to load', { cause });
    this.name = 'SchemaLoadError';
  }
}

const NOT_LOADED: ActionResult = { ok: false, issues: ['(root): profile is not loaded yet'] };

interface Gate {
  check: CheckDraft | null;
}

/** Loads the schema before the first read; writes wait for it, so a failed load overwrites nothing. */
function gatedStorage(guarded: StorageLike, loadSchema: SchemaLoader, gate: Gate): StateStorage {
  return {
    getItem: async (key) => {
      try {
        gate.check = await loadSchema();
      } catch (error) {
        throw new SchemaLoadError(error);
      }
      return guarded.getItem(key);
    },
    setItem: (key, value) => {
      if (gate.check !== null) guarded.setItem(key, value);
    },
    removeItem: (key) => {
      guarded.removeItem(key);
    },
  };
}

const draftOf = (persisted: unknown): unknown =>
  typeof persisted === 'object' && persisted !== null
    ? (persisted as { draft?: unknown }).draft
    : undefined;

const withoutUndefined = (value: object): object =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));

function mergeDraft(draft: ProfileDraft, patch: ProfileDraft): unknown {
  const scenario =
    patch.scenario === undefined
      ? draft.scenario
      : withoutUndefined({ ...draft.scenario, ...patch.scenario });
  return withoutUndefined({ ...draft, ...patch, scenario });
}

export function createProfileStore({
  backend = browserBackend,
  migrate = migrateDraft,
  loadSchema = loadProfileSchema,
}: Options = {}) {
  const guarded = createGuardedStorage(backend, () => {
    // set once: setState itself writes to storage, which would fail again
    if (!store.getState().persistError) store.setState({ persistError: true });
  });
  const gate: Gate = { check: null };
  const storage = gatedStorage(guarded, loadSchema, gate);
  const check = (value: unknown) => gate.check?.(value);

  const store = createStore<ProfileState>()(
    persist(
      (set, get) => {
        const accept = (candidate: unknown): ActionResult => {
          const checked = check(candidate);
          if (checked === undefined) return NOT_LOADED;
          if (!checked.ok) return checked;
          set({ draft: checked.draft });
          return { ok: true };
        };
        return {
          draft: {},
          hydrated: false,
          resetReason: null,
          persistError: false,
          loadError: false,
          update: (patch) => accept(mergeDraft(get().draft, patch)),
          replace: (draft) => accept(draft),
          clearAll: () => {
            set({ draft: {}, resetReason: null });
            // after set: every setState writes the key again
            store.persist.clearStorage();
          },
          acknowledgeReset: () => {
            set({ resetReason: null });
          },
        };
      },
      {
        name: STORAGE_KEY,
        version: CURRENT_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ draft: state.draft }),
        skipHydration: true,
        migrate: (persisted, version) => ({ draft: migrate(draftOf(persisted), version) }),
        // persist does not validate; a stored value of the wrong shape is discarded here
        merge: (persisted, current) => {
          // getItem has loaded the schema before persist calls merge
          const checked = check(draftOf(persisted) ?? {});
          return checked?.ok === true
            ? { ...current, draft: checked.draft }
            : { ...current, draft: {}, resetReason: 'invalid_shape' };
        },
        // persist leaves hasHydrated() false after an error, so the store keeps its own flag
        onRehydrateStorage: () => (_state, error) => {
          if (error instanceof SchemaLoadError) {
            // the stored key stays: writes are off until a load succeeds
            store.setState({ loadError: true, hydrated: true });
            return;
          }
          if (error !== undefined) {
            const future = error instanceof ProfileVersionError && error.code === 'future';
            store.setState({ draft: {}, resetReason: future ? 'future_version' : 'corrupt' });
          }
          store.setState({ hydrated: true });
          if (store.getState().resetReason !== null) storage.removeItem(STORAGE_KEY);
        },
      },
    ),
  );
  return store;
}

/** The app's store. On the server it never hydrates and has no storage, so it stays empty. */
export const profileStore = createProfileStore();
