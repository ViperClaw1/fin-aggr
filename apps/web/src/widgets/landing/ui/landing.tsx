import Link from 'next/link';

const ENTRIES = [
  {
    href: '/compare/cd',
    title: 'Compare',
    text: 'CDs, savings accounts and Treasuries, ranked by what you keep.',
  },
  {
    href: '/tools/fdic-coverage',
    title: 'Coverage',
    text: 'See how a balance fits under the insurance limit.',
  },
  {
    href: '/tools/after-tax-yield',
    title: 'After-tax yield',
    text: 'The best of each category once tax is taken off.',
  },
] as const;

/** Home: what the product is, three ways in, and how the site is paid. The money block is a DRAFT. */
export function Landing() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Compare deposits by what you keep
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Headline rates hide the tax. FA ranks CDs, savings accounts and Treasuries by the interest
          left after tax, and shows every step. Your profile stays in this browser.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {ENTRIES.map((entry) => (
          <li key={entry.href}>
            <Link
              href={entry.href}
              prefetch={false}
              className="panel block p-4 hover:border-border"
            >
              <span className="font-semibold">{entry.title}</span>
              <span className="mt-1 block text-sm text-muted">{entry.text}</span>
            </Link>
          </li>
        ))}
      </ul>
      <section className="max-w-2xl space-y-2" aria-labelledby="how-we-make-money">
        <h2 id="how-we-make-money" className="text-lg font-semibold">
          How we make money
        </h2>
        <p className="text-sm text-warn">Draft, pending legal review.</p>
        <p>
          We may be paid when you click a sponsored offer. Sponsored offers are labeled and never
          change the ranking.
        </p>
        <p>
          <Link href="/disclosure" prefetch={false} className="text-accent underline">
            Advertiser disclosure
          </Link>
        </p>
      </section>
    </div>
  );
}
