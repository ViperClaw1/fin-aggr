import type { Metadata } from 'next';
import { CoveragePlanner, loadCoverageData } from '@/widgets/coverage-planner';

export const metadata: Metadata = {
  title: 'FDIC coverage',
  description: 'See how a balance fits under the insurance limit. Demo data, not a determination.',
  alternates: { canonical: '/tools/fdic-coverage' },
};

export default async function CoveragePage() {
  const data = await loadCoverageData();
  return (
    <main className="mx-auto max-w-page px-4 py-6 sm:px-8 sm:py-8">
      <p className="text-xs font-medium tracking-widest text-muted uppercase">Tools</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">FDIC coverage</h1>
      <div className="mt-6">
        <CoveragePlanner {...data} />
      </div>
    </main>
  );
}
