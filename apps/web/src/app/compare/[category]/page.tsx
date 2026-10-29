import { STAGE1_CATEGORIES } from '@fa/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CompareTable, loadCompareData } from '@/widgets/compare-table';
import { SponsoredSlot } from '@/widgets/sponsored-slot';
import { DESCRIPTION, isStage1, TAB, TITLE } from './category-texts';

// The page reads params outside <Suspense> on purpose: wrapping it streams a skeleton first, and
// without JavaScript the catalog then never shows (e2e "does not move on hydration" runs with JS
// off). A navigation between categories waits for the server instead; prefetch is off anyway.
export const instant = false;

export function generateStaticParams() {
  return STAGE1_CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: PageProps<'/compare/[category]'>): Promise<Metadata> {
  const { category } = await params;
  if (!isStage1(category)) return { title: 'Not found' };
  return {
    title: TITLE[category],
    description: DESCRIPTION[category],
    alternates: { canonical: `/compare/${category}` },
  };
}

// The catalog is loaded at build time and passed as props (ADR-016 D1); the table filters it in memory.
export default async function ComparePage({ params }: PageProps<'/compare/[category]'>) {
  const { category } = await params;
  if (!isStage1(category)) notFound();
  const data = await loadCompareData(category);
  return (
    <main className="mx-auto max-w-page px-4 py-6 sm:px-8 sm:py-8">
      <p className="text-xs font-medium tracking-widest text-muted uppercase">Deposit comparison</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{TITLE[category]}</h1>
      {/* prefetch off on every new link: a partial prefetch keeps its request open, so the page
          never goes network-idle (the AC-4 privacy test waits for it) */}
      <nav
        aria-label="Product category"
        className="mt-4 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--divider)]"
      >
        <ul className="flex gap-6 text-sm">
          {STAGE1_CATEGORIES.map((c) => (
            <li key={c}>
              <Link
                href={`/compare/${c}`}
                prefetch={false}
                aria-current={c === category ? 'page' : undefined}
                className="inline-block border-b-2 border-transparent py-2 whitespace-nowrap text-muted hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
              >
                {TAB[c]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {/* above the table, never inside it (AC-6, ADR-006) */}
      <div className="my-6">
        <SponsoredSlot placement="compare_top" />
      </div>
      <CompareTable category={category} {...data} />
    </main>
  );
}
