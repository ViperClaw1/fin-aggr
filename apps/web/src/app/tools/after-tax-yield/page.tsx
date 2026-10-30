import type { Metadata } from 'next';
import { YieldComparator, loadYieldData } from '@/widgets/yield-comparator';

export const metadata: Metadata = {
  title: 'After-tax yield',
  description: 'The best CD, savings account and Treasury after tax, for your profile.',
  alternates: { canonical: '/tools/after-tax-yield' },
};

export default async function AfterTaxYieldPage() {
  const data = await loadYieldData();
  return (
    <main className="mx-auto max-w-page px-4 py-6 sm:px-8 sm:py-8">
      <p className="text-xs font-medium tracking-widest text-muted uppercase">Tools</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">After-tax yield</h1>
      <div className="mt-6">
        <YieldComparator {...data} />
      </div>
    </main>
  );
}
