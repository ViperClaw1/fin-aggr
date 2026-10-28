'use client';

import type { Profile } from '@fa/contracts';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { toCompleteProfile } from './complete';
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
export function useCompleteProfile(): Profile | null {
  const draft = useProfileDraft();
  return useMemo(() => toCompleteProfile(draft), [draft]);
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

/** Reads the stored profile once on the client; safe to call twice (StrictMode). */
export async function rehydrateProfile(): Promise<void> {
  await profileStore.persist.rehydrate();
}
