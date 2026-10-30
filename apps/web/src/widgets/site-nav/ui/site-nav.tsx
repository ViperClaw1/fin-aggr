'use client';

import Link from 'next/link';
import { useState } from 'react';

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

function Links() {
  return (
    <>
      <details className="relative">
        <summary
          className={`${itemClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        >
          Compare <Chevron />
        </summary>
        <div className="grid min-w-44 rounded-md border border-border bg-background p-1.5 shadow-lg md:absolute md:top-11 md:left-0">
          <Link
            href="/compare/cd"
            prefetch={false}
            className="rounded px-2.5 py-2.5 no-underline hover:bg-divider"
          >
            CDs
          </Link>
          <Link
            href="/compare/savings"
            prefetch={false}
            className="rounded px-2.5 py-2.5 no-underline hover:bg-divider"
          >
            Savings
          </Link>
          <Link
            href="/compare/treasury"
            prefetch={false}
            className="rounded px-2.5 py-2.5 no-underline hover:bg-divider"
          >
            Treasuries
          </Link>
        </div>
      </details>
      <Link href="/banks" prefetch={false} className={itemClass}>
        Banks
      </Link>
      <details className="relative">
        <summary
          className={`${itemClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        >
          Tools <Chevron />
        </summary>
        <div className="grid min-w-44 rounded-md border border-border bg-background p-1.5 shadow-lg md:absolute md:top-11 md:left-0">
          <Link
            href="/tools/fdic-coverage"
            prefetch={false}
            className="rounded px-2.5 py-2.5 no-underline hover:bg-divider"
          >
            FDIC coverage
          </Link>
          <Link
            href="/tools/after-tax-yield"
            prefetch={false}
            className="rounded px-2.5 py-2.5 no-underline hover:bg-divider"
          >
            After-tax yield
          </Link>
        </div>
      </details>
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
