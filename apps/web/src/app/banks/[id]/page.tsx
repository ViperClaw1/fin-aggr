import { isId } from '@fa/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SafetyBadge } from '@/entities/institution';
import { bankIdFromParam } from '@/shared/lib/bank-param';
import { BankHealth, loadBank, loadBankParams } from '@/widgets/bank-health';

export const instant = false;

export async function generateStaticParams() {
  return loadBankParams();
}

export async function generateMetadata({ params }: PageProps<'/banks/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const bankId = bankIdFromParam(id);
  if (!isId(bankId)) return { title: 'Not found' };
  const data = await loadBank(bankId);
  if (data === null) return { title: 'Not found' };
  return {
    title: data.institution.name,
    description: `Rates and call-report metrics for ${data.institution.name}. Demo data.`,
    alternates: { canonical: `/banks/${id}` },
  };
}

export default async function BankPage({ params }: PageProps<'/banks/[id]'>) {
  const { id } = await params;
  const bankId = bankIdFromParam(id);
  if (!isId(bankId)) notFound();
  const data = await loadBank(bankId);
  if (data === null) notFound();
  return (
    <main className="mx-auto max-w-page px-4 py-6 sm:px-8 sm:py-8">
      <p className="text-xs font-medium tracking-widest text-muted uppercase">Institution</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        {data.institution.name}
      </h1>
      <div className="mt-3">
        <SafetyBadge kind={data.institution.kind} partners={data.partners} />
      </div>
      <div className="mt-8">
        <BankHealth {...data} />
      </div>
    </main>
  );
}
