import type { Metadata } from 'next';
import { Landing } from '@/widgets/landing';

export const metadata: Metadata = { alternates: { canonical: '/' } };

export default function HomePage() {
  return (
    <main className="mx-auto max-w-page px-4 sm:px-8">
      <Landing />
    </main>
  );
}
