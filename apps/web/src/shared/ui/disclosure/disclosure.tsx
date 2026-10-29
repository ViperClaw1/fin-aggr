'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface DisclosureProps {
  /** Visible part of the toggle, e.g. a value or a chip. */
  summary: ReactNode;
  /** Appended for screen readers: "4.35%, How is this calculated?". */
  label: string;
  children: ReactNode;
  /** From `sm` the panel opens from the toggle's left edge, or its right one for an end-aligned cell. */
  align?: 'start' | 'end';
  /** The ⓘ mark after the summary; off when the summary carries its own marker. */
  icon?: boolean;
}

/**
 * Native <details> (no Popover API: Safari 16.4 floor, ADR-014). From `sm` up the panel is
 * absolute so a table row does not grow; on phones it stays in the flow. Escape closes it and returns focus, which <details> lacks natively.
 * Not inside <p>: <details> is not phrasing content.
 */
export function Disclosure({
  summary,
  label,
  children,
  align = 'start',
  icon = true,
}: DisclosureProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const details = ref.current;
    if (details === null) return undefined;
    // native listener: keyboard handlers on <details> itself are not allowed by jsx-a11y
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !details.open) return;
      details.open = false;
      details.querySelector('summary')?.focus();
    };
    details.addEventListener('keydown', onKey);
    return () => {
      details.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <details ref={ref} className="relative inline-block">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 tabular-nums [&::-webkit-details-marker]:hidden">
        {summary}
        {icon ? (
          <span aria-hidden="true" className="text-muted">
            ⓘ
          </span>
        ) : null}
        <span className="sr-only">, {label}</span>
      </summary>
      {/* in the flow on phones (an absolute panel from a toggle near the right edge would leave
          the screen), absolute from `sm` up so a table row keeps its height */}
      <div
        className={`z-(--z-popover) mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-background p-3 text-left text-sm font-normal whitespace-normal shadow-lg sm:absolute ${align === 'end' ? 'sm:right-0' : 'sm:left-0'}`}
      >
        {children}
      </div>
    </details>
  );
}
