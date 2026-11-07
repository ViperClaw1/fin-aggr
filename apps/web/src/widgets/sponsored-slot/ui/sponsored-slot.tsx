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
          className="flex flex-col gap-2 rounded-lg border border-dashed border-border px-3 py-3"
        >
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            Sponsored · {item.advertiser}
          </p>
          <p className="font-medium">{item.headline}</p>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">About this ad</summary>
              {item.body === '' ? null : <p className="mt-1 max-w-sm">{item.body}</p>}
              <p className="mt-1 max-w-sm">{item.disclosure}</p>
            </details>
            <a
              href={item.ctaUrl}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="btn btn-sm shrink-0"
            >
              {item.ctaLabel}
              <span className="sr-only"> (sponsored link, opens in a new tab)</span>
            </a>
          </div>
        </div>
      ))}
    </aside>
  );
}
