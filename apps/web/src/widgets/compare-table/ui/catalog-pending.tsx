/** Shown over the catalog while a saved profile is ranked (ADR-017). The real rows stay in the DOM. */
export function CatalogPending() {
  return (
    <div
      data-catalog-pending
      role="status"
      className="overflow-hidden rounded-lg border border-divider bg-surface p-3"
    >
      <span className="sr-only">Ranking for your profile…</span>
      <ul className="flex flex-col gap-3" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index} className="rounded-lg border border-divider bg-background p-3">
            <div className="shimmer h-4 w-36 rounded-sm" />
            <div className="shimmer mt-2 h-4 w-52 max-w-full rounded-sm" />
            <div className="shimmer mt-3 h-6 w-24 rounded-sm" />
            <div className="mt-3 flex gap-4">
              <div className="shimmer h-3 w-14 rounded-sm" />
              <div className="shimmer h-3 w-20 rounded-sm" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
