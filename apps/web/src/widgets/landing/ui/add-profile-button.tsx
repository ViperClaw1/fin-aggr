'use client';

import { PROFILE_FORM_FIELDS, useProfileDrawer } from '@/entities/profile';

/** Opens the profile drawer on the first field. The header button stays the summary. */
export function AddProfileButton() {
  const { open } = useProfileDrawer();
  return (
    <button
      type="button"
      className="btn"
      onClick={() => {
        open(PROFILE_FORM_FIELDS[0]);
      }}
    >
      Add your profile
    </button>
  );
}
