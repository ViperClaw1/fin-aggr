import { STAGE1_CATEGORIES } from '@fa/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CompareTable, loadCompareData } from '@/widgets/compare-table';

const TITLE: Record<(typeof STAGE1_CATEGORIES)[number], string> = {
  cd: 'Compare CDs',
  savings: 'Compare savings accounts',
  treasury: 'Compare Treasuries',
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
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <h1 className="mb-4 text-2xl font-semibold">{TITLE[category]}</h1>
      <CompareTable category={category} {...data} />
    </main>
  );
}
