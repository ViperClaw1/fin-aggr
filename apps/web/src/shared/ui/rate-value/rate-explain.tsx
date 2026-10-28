'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Native <details> (no Popover API: Safari 16.4 floor, ADR-014). The panel is absolute so a
 * table row does not grow. Escape closes it and returns focus, which <details> lacks natively.
 */
export function RateExplain({
  text,
  label,
  children,
}: {
  text: string;
  label: string;
  children: ReactNode;
}) {
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
        {text}
        <span aria-hidden="true" className="text-muted">
          ⓘ
        </span>
        <span className="sr-only">, {label}</span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded border border-border bg-background p-3 text-sm shadow-lg">
        {children}
      </div>
    </details>
  );
}
