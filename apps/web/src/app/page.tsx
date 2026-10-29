import Link from 'next/link';

const CATEGORIES = [
  { href: '/compare/cd', title: 'CDs', text: 'Certificates of deposit by term and rate.' },
  { href: '/compare/savings', title: 'Savings', text: 'Savings accounts by rate and minimum.' },
  { href: '/compare/treasury', title: 'Treasuries', text: 'Treasury bills and notes.' },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Compare deposits</h1>
      <p className="mt-2 text-muted">Rank products by what you keep after tax.</p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {CATEGORIES.map((c) => (
          <li key={c.href}>
            <Link href={c.href} prefetch={false} className="panel block p-4 hover:border-border">
              <span className="font-semibold">{c.title}</span>
              <span className="mt-1 block text-sm text-muted">{c.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
