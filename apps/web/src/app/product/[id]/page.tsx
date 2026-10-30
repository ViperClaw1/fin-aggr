import { isId } from '@fa/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SponsoredSlot } from '@/widgets/sponsored-slot';
import { loadProductData, loadProductParams, ProductBreakdown } from '@/widgets/product-breakdown';

// Reads params outside <Suspense> on purpose: the shell must be in the static HTML (see compare).
export const instant = false;

export async function generateStaticParams() {
  return loadProductParams();
}

export async function generateMetadata({ params }: PageProps<'/product/[id]'>): Promise<Metadata> {
  const { id } = await params;
  if (!isId(id)) return { title: 'Not found' };
  const data = await loadProductData(id);
  if (data === null) return { title: 'Not found' };
  const description = `After-tax breakdown of ${data.product.name} at ${data.institution.name}. Demo data.`;
  return {
    title: data.product.name,
    description,
    alternates: { canonical: `/product/${id}` },
  };
}

export default async function ProductPage({ params }: PageProps<'/product/[id]'>) {
  const { id } = await params;
  if (!isId(id)) notFound();
  const data = await loadProductData(id);
  if (data === null) notFound();
  return (
    <main className="mx-auto max-w-page px-4 py-6 sm:px-8 sm:py-8">
      <p className="text-xs font-medium tracking-widest text-muted uppercase">
        {data.product.category}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        {data.product.name}
      </h1>
      <p className="mt-1 text-muted">{data.institution.name}</p>
      {/* the ad sits beside the breakdown, never inside it (AC-6) */}
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <ProductBreakdown {...data} />
        <SponsoredSlot placement="product_aside" />
      </div>
    </main>
  );
}
