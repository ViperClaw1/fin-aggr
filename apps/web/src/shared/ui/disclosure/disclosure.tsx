'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

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
 * The panel mounts only while open, so a closed quote, source or eligibility reason is not in the DOM (E7).
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
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const details = ref.current;
    if (details === null) return undefined;
    // A test or a script can set `.open` before this effect runs. `toggle` does not bubble,
    // so read the property here and listen on the element itself.
    const sync = (): void => {
      setOpen(details.open);
    };
    // native listener: keyboard handlers on <details> itself are not allowed by jsx-a11y
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !details.open) return;
      details.open = false;
      details.querySelector('summary')?.focus();
    };
    details.addEventListener('toggle', sync);
    details.addEventListener('keydown', onKey);
    sync();
    details.dataset.ready = '';
    return () => {
      details.removeEventListener('toggle', sync);
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
      {open ? (
        <div
          className={`z-(--z-popover) mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-background p-3 text-left text-sm font-normal whitespace-normal shadow-lg sm:absolute ${align === 'end' ? 'sm:right-0' : 'sm:left-0'}`}
        >
          {children}
        </div>
      ) : null}
    </details>
  );
}
