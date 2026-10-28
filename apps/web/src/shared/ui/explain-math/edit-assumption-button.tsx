'use client';

import type { Assumption } from '@fa/contracts';

export function EditAssumptionButton({
  assumption,
  onEdit,
}: {
  assumption: Assumption;
  onEdit: (id: string) => void;
}) {
  return (
    <button
      type="button"
      // names the assumption: a list of plain "Edit" buttons is ambiguous to a screen reader
      aria-label={`Edit assumption: ${assumption.text}`}
      onClick={() => {
        onEdit(assumption.id);
      }}
      className="ml-2 text-sm text-accent underline"
    >
      Edit
    </button>
  );
}
