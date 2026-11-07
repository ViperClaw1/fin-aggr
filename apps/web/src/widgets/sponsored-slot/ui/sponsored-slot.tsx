// A labeled ad slot (ADR-006). Mounted only in app/** next to the organic widgets, never inside a
// table, list or card of results (AC-6). A server component: nothing of it runs in the browser.
// Every item says "Sponsored" in words and carries its disclosure; the link is marked sponsored.
import type { SponsoredPlacement } from '@fa/contracts/ads';
import { loadSponsored } from '../api/load';

export interface SponsoredSlotProps {
  placement: SponsoredPlacement;
}

export async function SponsoredSlot({ placement }: SponsoredSlotProps) {
  const items = await loadSponsored(placement);
  if (items.length === 0) return null;
  return (
    <aside aria-label="Sponsored" className="flex flex-col gap-3" data-sponsored={placement}>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-dashed border-border px-3"
        >
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            Sponsored · {item.advertiser}
          </p>
          <p className="min-w-0 flex-1 truncate font-medium">{item.headline}</p>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">About this ad</summary>
            {item.body === '' ? null : <p className="mt-1 max-w-sm">{item.body}</p>}
            <p className="mt-1 max-w-sm">{item.disclosure}</p>
          </details>
          <a
            href={item.ctaUrl}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="btn btn-sm"
          >
            {item.ctaLabel}
            <span className="sr-only"> (sponsored link, opens in a new tab)</span>
          </a>
        </div>
      ))}
    </aside>
  );
}
