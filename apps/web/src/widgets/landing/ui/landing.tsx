import Link from 'next/link';
import { Suspense } from 'react';
import { AddProfileButton } from './add-profile-button';

const PROOF = [
  ['Published yield', 'Source attached'],
  ['Your tax assumptions', 'Stored locally'],
  ['Net yield estimate', 'Math shown'],
] as const;

/** Home. The commercial-model copy is a DRAFT until legal review. */
export function Landing() {
  return (
    <div>
      <Hero />
      <Questions />
      <HowItWorks />
      <CommercialModel />
    </div>
  );
}

function Hero() {
  return (
    <section className="grid items-center gap-9 py-12 lg:min-h-[32rem] lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)] lg:gap-16 lg:py-[4.5rem]">
      <div>
        <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
          Deposit comparison, made inspectable
        </p>
        <h1 className="mt-2.5 max-w-xl text-4xl font-semibold tracking-tight">
          Compare deposits by what you actually keep.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          After-tax yield, sources for every number, and your profile never leaves your browser.
        </p>
        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
          <Link href="/compare/cd" prefetch={false} className="btn btn-primary">
            Compare CDs
          </Link>
          <Suspense
            fallback={
              <button type="button" className="btn" disabled>
                Add your profile
              </button>
            }
          >
            <AddProfileButton />
          </Suspense>
        </div>
      </div>
      <aside
        aria-label="How FA evaluates a product"
        className="rounded-lg border border-border p-6"
      >
        <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
          An inspectable comparison
        </p>
        <ol className="my-4">
          {PROOF.map(([label, value]) => (
            <li
              key={label}
              className="flex items-center justify-between gap-4 border-b border-border py-3.5 first:border-t"
            >
              <span className="text-muted">{label}</span>
              <strong className="text-right text-xs font-semibold">{value}</strong>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted">No product can pay to move up the ranking.</p>
      </aside>
    </section>
  );
}

function Questions() {
  return (
    <section aria-labelledby="start-title" className="border-t border-divider py-16">
      <div className="mb-7 max-w-xl">
        <p className="mb-1.5 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
          Start with a question
        </p>
        <h2 id="start-title" className="text-3xl font-semibold tracking-tight">
          What do you want to check?
        </h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
        <article className="flex min-h-64 flex-col rounded-lg border border-accent bg-accent/5 p-6">
          <p className="font-mono text-xs font-semibold tracking-wide text-muted uppercase">
            01 · Compare
          </p>
          <h3 className="mt-5 max-w-[16rem] text-xl font-semibold">
            Find the strongest deposit option after tax.
          </h3>
          <nav aria-label="Compare deposit products" className="mt-auto grid w-full">
            <CompareLink href="/compare/cd">CDs</CompareLink>
            <CompareLink href="/compare/savings">Savings</CompareLink>
            <CompareLink href="/compare/treasury">Treasuries</CompareLink>
          </nav>
        </article>
        <article className="flex min-h-64 flex-col rounded-lg border border-border p-6">
          <p className="font-mono text-xs font-semibold tracking-wide text-muted uppercase">
            02 · Bank health
          </p>
          <h3 className="mt-5 text-xl font-semibold">Check a bank’s financial health.</h3>
          <p className="mt-3 text-muted">
            Review capital, asset quality and recent filings with every metric linked to its source.
          </p>
          <Link href="/banks" prefetch={false} className="mt-auto font-semibold text-accent">
            Check a bank <span aria-hidden="true">→</span>
          </Link>
        </article>
        <article className="flex min-h-64 flex-col rounded-lg border border-border p-6">
          <p className="font-mono text-xs font-semibold tracking-wide text-muted uppercase">
            03 · Coverage
          </p>
          <h3 className="mt-5 text-xl font-semibold">Plan FDIC coverage across accounts.</h3>
          <p className="mt-3 text-muted">
            Organize ownership categories and balances before moving a deposit.
          </p>
          <Link
            href="/tools/fdic-coverage"
            prefetch={false}
            className="mt-auto font-semibold text-accent"
          >
            Plan coverage <span aria-hidden="true">→</span>
          </Link>
        </article>
      </div>
    </section>
  );
}

function CompareLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="flex justify-between border-t border-border py-3 font-semibold no-underline"
    >
      {children}
      <span className="text-accent" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

const STEPS = [
  ['Set your profile', 'It stays in this browser and can be exported or erased.'],
  ['We compute net yield after tax', 'Federal, state and optional local assumptions stay visible.'],
  ['Check every number at its source', 'Open the quoted document beside the fact it supports.'],
] as const;

function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="border-t border-divider py-16">
      <div className="mb-7 max-w-xl">
        <p className="mb-1.5 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
          How it works
        </p>
        <h2 id="how-title" className="text-3xl font-semibold tracking-tight">
          Three steps, with no black box.
        </h2>
      </div>
      <ol className="grid gap-7 lg:grid-cols-3 lg:gap-6">
        {STEPS.map(([title, text], index) => (
          <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-3.5">
            <span
              className="grid size-9 place-items-center bg-accent font-bold text-accent-foreground"
              style={{ borderRadius: '999px' }}
            >
              {index + 1}
            </span>
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1.5 text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CommercialModel() {
  return (
    <section
      aria-labelledby="money-title"
      className="mb-16 grid gap-6 rounded-lg border border-warn bg-warn-bg p-6 text-warn lg:grid-cols-[1fr_1.6fr] lg:gap-12 lg:p-8"
    >
      <div>
        <p className="text-xs font-semibold tracking-[0.08em] uppercase">Commercial model</p>
        <h2 id="money-title" className="mt-1.5 text-2xl font-semibold">
          How we make money
        </h2>
      </div>
      <div>
        <p className="text-sm font-semibold">Draft, pending legal review.</p>
        <p className="mt-3 max-w-[62ch]">
          Sponsored placements are labeled and never change the ranking. An advertiser may pay for a
          placement or a completed action, but not for a better position in results.
        </p>
        <Link href="/disclosure" prefetch={false} className="mt-3.5 inline-block font-bold">
          Read the disclosure →
        </Link>
      </div>
    </section>
  );
}
