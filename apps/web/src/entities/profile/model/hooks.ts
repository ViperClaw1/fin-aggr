'use client';

import type { Profile } from '@fa/contracts';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { toCompleteProfile } from './complete';
import { scheduleWhenIdle, startProfileHydration } from './hydrate';
import { hasStoredProfile } from './persist';
import { profileStore, type ProfileState } from './store';

export const useProfileDraft = () => useStore(profileStore, (s) => s.draft);

export const useProfileHydrated = () => useStore(profileStore, (s) => s.hydrated);

type ProfileStatus = Pick<ProfileState, 'hydrated' | 'resetReason' | 'persistError' | 'loadError'>;

// Explicit return: destructuring this result otherwise cycles through useShallow's type params (TS7022).
export const useProfileStatus = (): ProfileStatus =>
  useStore(
    profileStore,
    useShallow((s): ProfileStatus => ({
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
 *  The draft check does not load zod, with or without a stored key. */
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
