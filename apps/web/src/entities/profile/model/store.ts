// The profile store (ADR-004, ADR-009): a draft persisted in this browser only. Hydration is manual
// (skipHydration) so the static shell renders without a profile; HydrateProfile starts it.
// Reading the stored draft does not load zod (ADR-016 D5). isProfileDraft checks the shape.
// The schema chunk loads only when a profile file is imported, which needs its error messages.
import { isProfileDraft, type ProfileDraft } from '@fa/contracts';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
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
  /** Kept for the load-failure notice. Reading a draft no longer loads the schema, so it stays false. */
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
}

const NOT_LOADED: ActionResult = { ok: false, issues: ['(root): profile is not loaded yet'] };
const INVALID: ActionResult = { ok: false, issues: ['(root): invalid profile'] };

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
}: Options = {}) {
  const guarded = createGuardedStorage(backend, () => {
    // set once: setState itself writes to storage, which would fail again
    if (!store.getState().persistError) store.setState({ persistError: true });
  });
  const storage = guarded;

  const store = createStore<ProfileState>()(
    persist(
      (set, get) => {
        const accept = (candidate: unknown): ActionResult => {
          if (!get().hydrated) return NOT_LOADED;
          if (!isProfileDraft(candidate)) return INVALID;
          set({ draft: candidate });
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
          const draft = draftOf(persisted) ?? {};
          return isProfileDraft(draft)
            ? { ...current, draft }
            : { ...current, draft: {}, resetReason: 'invalid_shape' };
        },
        // persist leaves hasHydrated() false after an error, so the store keeps its own flag
        onRehydrateStorage: () => (_state, error) => {
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
