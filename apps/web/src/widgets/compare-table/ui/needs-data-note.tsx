'use client';

// "N products need more data": names the missing profile fields and opens the profile drawer on
// each (?profile=<field>). Reads the URL: rendered only after hydration, inside <Suspense>.
import { PROFILE_FIELD_LABEL } from '@fa/contracts';
import { useProfileDrawer } from '@/entities/profile';
import type { NeedsData } from '../model/needs-data';

export function NeedsDataNote({ needs }: { needs: NeedsData }) {
  const { open } = useProfileDrawer();
  const products = needs.count === 1 ? '1 product needs' : `${String(needs.count)} products need`;
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-warn bg-warn-bg p-3 text-warn sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm font-medium">
        {products} more data from your profile to tell whether you can open them.
      </p>
      <div className="flex flex-wrap gap-2">
        {needs.fields.map(({ rule, form }) => (
          <button
            key={rule}
            type="button"
            className="btn btn-sm text-foreground"
            onClick={() => {
              open(form);
            }}
          >
            Add {PROFILE_FIELD_LABEL[rule]}
          </button>
        ))}
      </div>
    </div>
  );
}
