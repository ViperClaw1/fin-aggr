'use client';

import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { useEffect, type ReactNode } from 'react';
import { rehydrateProfile } from '@/entities/profile';

/** The static shell renders without a profile; the stored one is read after mount (ADR-008). */
function HydrateProfile() {
  useEffect(() => {
    void rehydrateProfile();
  }, []);
  return null;
}

/** Client state roots (ADR-009): URL state and the profile. The query client mounts with the citation panel. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <NuqsAdapter>
      <HydrateProfile />
      {children}
    </NuqsAdapter>
  );
}
