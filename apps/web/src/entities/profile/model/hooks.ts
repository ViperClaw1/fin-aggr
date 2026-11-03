'use client';

import type { Profile } from '@fa/contracts';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { toCompleteProfile } from './complete';
import { scheduleWhenIdle, startProfileHydration } from './hydrate';
import { hasStoredProfile } from './persist';
import { profileStore } from './store';

export const useProfileDraft = () => useStore(profileStore, (s) => s.draft);

export const useProfileHydrated = () => useStore(profileStore, (s) => s.hydrated);

export const useProfileStatus = () =>
  useStore(
    profileStore,
    useShallow((s) => ({
      hydrated: s.hydrated,
      resetReason: s.resetReason,
      persistError: s.persistError,
      loadError: s.loadError,
    })),
  );

/** Derived outside the selector: a new object per call inside it would loop useSyncExternalStore. */
export function useCompleteProfile(tablesYear: number): Profile | null {
  const draft = useProfileDraft();
  return useMemo(() => toCompleteProfile(draft, tablesYear), [draft, tablesYear]);
}

/** Writes. Only features/edit-profile may import this (ESLint PROFILE_WRITE). */
export const useProfileActions = () =>
  useStore(
    profileStore,
    useShallow((s) => ({
      update: s.update,
      replace: s.replace,
      clearAll: s.clearAll,
      acknowledgeReset: s.acknowledgeReset,
    })),
  );

/** Reads the stored profile once on the client; safe to call twice (StrictMode).
 *  No stored key: nothing is imported. A stored key loads the schema once the browser is idle. */
export function rehydrateProfile(): Promise<void> {
  return startProfileHydration(
    {
      setState: (partial) => {
        profileStore.setState(partial);
      },
      rehydrate: async () => {
        await profileStore.persist.rehydrate();
      },
    },
    hasStoredProfile(),
    scheduleWhenIdle,
  );
}

/** True once the schema chunk has loaded. Mount this only where an edit can happen. */
export function useProfileSchema(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void profileStore.ensureSchema().then(
      () => {
        if (live) setReady(true);
      },
      () => {
        if (live) setReady(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return ready;
}
