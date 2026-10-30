import type { Metadata } from 'next';
import { BankSearch, loadBankList } from '@/widgets/bank-search';

export const metadata: Metadata = {
  title: 'Banks',
  description: 'Banks and credit unions in the demo catalog, with their top rate.',
  alternates: { canonical: '/banks' },
};

export default async function BanksPage() {
  const data = await loadBankList();
  return (
    <main className="mx-auto max-w-page px-4 py-6 sm:px-8 sm:py-8">
      <p className="text-xs font-medium tracking-widest text-muted uppercase">Institutions</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Banks</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Search the demo catalog. Rates are the best headline APY of that institution&apos;s
        products.
      </p>
      <div className="mt-6">
        <BankSearch {...data} />
      </div>
    </main>
  );
}
