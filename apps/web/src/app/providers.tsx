'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { useEffect, type ReactNode } from 'react';
import { rehydrateProfile } from '@/entities/profile';
import { getQueryClient } from '@/shared/lib/query-client';

/** The static shell renders without a profile; the stored one is read after mount (ADR-008). */
function HydrateProfile() {
  useEffect(() => {
    void rehydrateProfile();
  }, []);
  return null;
}

/** Client state roots (ADR-009): remote data, URL state and the profile. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <NuqsAdapter>
        <HydrateProfile />
        {children}
      </NuqsAdapter>
    </QueryClientProvider>
  );
}
