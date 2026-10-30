'use client';

// Opens the profile drawer on the field an assumption edits. Writes nothing itself (decision 1):
// the form in features/edit-profile is the only writer. The caller sits inside <Suspense>.
import { useProfileDrawer } from '@/entities/profile';
import { assumptionField } from './assumption-field';

export function useEditAssumptions(): (id: string) => void {
  const { open } = useProfileDrawer();
  return (id: string) => {
    const field = assumptionField(id);
    if (field !== null) open(field);
  };
}
