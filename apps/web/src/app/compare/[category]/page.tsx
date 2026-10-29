import { STAGE1_CATEGORIES } from '@fa/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CompareTable, loadCompareData } from '@/widgets/compare-table';
import { SponsoredSlot } from '@/widgets/sponsored-slot';

const TITLE: Record<(typeof STAGE1_CATEGORIES)[number], string> = {
  cd: 'Compare CDs',
  savings: 'Compare savings accounts',
  treasury: 'Compare Treasuries',
};

const TAB: Record<(typeof STAGE1_CATEGORIES)[number], string> = {
  cd: 'CDs',
  savings: 'Savings',
  treasury: 'Treasuries',
};

const isStage1 = (c: string): c is (typeof STAGE1_CATEGORIES)[number] =>
  (STAGE1_CATEGORIES as readonly string[]).includes(c);

export function generateStaticParams() {
  return STAGE1_CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: PageProps<'/compare/[category]'>): Promise<Metadata> {
  const { category } = await params;
  return { title: isStage1(category) ? TITLE[category] : 'Not found' };
}

// The catalog is loaded at build time and passed as props (ADR-016 D1); the table filters it in memory.
export default async function ComparePage({ params }: PageProps<'/compare/[category]'>) {
  const { category } = await params;
  if (!isStage1(category)) notFound();
  const data = await loadCompareData(category);
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <p className="text-xs font-medium tracking-widest text-muted uppercase">Deposit comparison</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{TITLE[category]}</h1>
      {/* prefetch off on every new link: a partial prefetch keeps its request open, so the page
          never goes network-idle (the AC-4 privacy test waits for it) */}
      <nav aria-label="Product category" className="mt-4 overflow-x-auto border-b border-divider">
        <ul className="flex gap-6 text-sm">
          {STAGE1_CATEGORIES.map((c) => (
            <li key={c}>
              <Link
                href={`/compare/${c}`}
                prefetch={false}
                aria-current={c === category ? 'page' : undefined}
                className="-mb-px inline-block border-b-2 border-transparent py-2 whitespace-nowrap text-muted hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
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
