// The profile store (ADR-004, ADR-009): a draft persisted in this browser only. Hydration is manual
// (skipHydration) so the static shell renders without a profile; HydrateProfile starts it.
import { ProfileDraft } from '@fa/contracts';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import { CURRENT_VERSION, migrateDraft, ProfileVersionError, type Migrator } from './migrate';
import { browserBackend, createGuardedStorage, type StorageLike } from './persist';
import { issuesOf } from './serialize';

export const STORAGE_KEY = 'fa.profile';

/** Why a stored profile was discarded; shown once, never persisted. */
type ResetReason = 'corrupt' | 'future_version' | 'invalid_shape';
export type ActionResult = { ok: true } | { ok: false; issues: readonly string[] };

export interface ProfileState {
  draft: ProfileDraft;
  hydrated: boolean;
  resetReason: ResetReason | null;
  /** storage failed (quota, blocked): the profile lives in memory for this session */
  persistError: boolean;
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
  const storage = createGuardedStorage(backend, () => {
    // set once: setState itself writes to storage, which would fail again
    if (!store.getState().persistError) store.setState({ persistError: true });
  });

  const store = createStore<ProfileState>()(
    persist(
      (set, get) => {
        const accept = (candidate: unknown): ActionResult => {
          const parsed = ProfileDraft.safeParse(candidate);
          if (!parsed.success) return { ok: false, issues: issuesOf(parsed.error) };
          set({ draft: parsed.data });
          return { ok: true };
        };
        return {
          draft: {},
          hydrated: false,
          resetReason: null,
          persistError: false,
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
          const parsed = ProfileDraft.safeParse(draftOf(persisted) ?? {});
          return parsed.success
            ? { ...current, draft: parsed.data }
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
