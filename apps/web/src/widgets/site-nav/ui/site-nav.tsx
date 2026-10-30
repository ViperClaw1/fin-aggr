'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const itemClass =
  'flex min-h-10 items-center gap-1 rounded px-2.5 font-medium text-muted no-underline hover:bg-divider hover:text-foreground';

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m8 10 4 4 4-4" />
    </svg>
  );
}

const MENUS = [
  {
    label: 'Compare',
    items: [
      { href: '/compare/cd', label: 'CDs' },
      { href: '/compare/savings', label: 'Savings' },
      { href: '/compare/treasury', label: 'Treasuries' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/tools/fdic-coverage', label: 'FDIC coverage' },
      { href: '/tools/after-tax-yield', label: 'After-tax yield' },
    ],
  },
] as const;

function NavMenu({ label, items }: (typeof MENUS)[number]) {
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const menu = root.current;
      if (menu?.open !== true) return;
      if (event.target instanceof Node && menu.contains(event.target)) return;
      menu.open = false;
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);
  const close = () => {
    const menu = root.current;
    if (menu !== null) menu.open = false;
  };
  return (
    <details ref={root} className="relative">
      <summary
        className={`${itemClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        {label} <Chevron />
      </summary>
      <div className="grid min-w-44 rounded-md border border-border bg-background p-1.5 shadow-lg md:absolute md:top-11 md:left-0">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className="rounded px-2.5 py-2.5 no-underline hover:bg-divider"
            onClick={close}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

function Links() {
  return (
    <>
      <NavMenu {...MENUS[0]} />
      <Link href="/banks" prefetch={false} className={itemClass}>
        Banks
      </Link>
      <NavMenu {...MENUS[1]} />
      <Link href="/methodology" prefetch={false} className={itemClass}>
        Methodology
      </Link>
    </>
  );
}

/** Primary navigation. On a narrow screen the links sit under the header until Menu is opened. */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-sm order-2 px-3 md:hidden"
        aria-expanded={open}
        aria-controls="primary-nav"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        Menu
      </button>
      <nav
        id="primary-nav"
        aria-label="Primary"
        className={
          open
            ? 'order-4 flex basis-full flex-col gap-1 border-t border-divider py-2 md:order-1 md:flex-1 md:basis-auto md:flex-row md:border-0 md:py-0'
            : 'order-1 hidden flex-1 items-center gap-1 md:flex'
        }
      >
        <Links />
      </nav>
    </>
  );
}
