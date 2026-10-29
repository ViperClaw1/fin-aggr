import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import { Suspense } from 'react';
import { DemoDataBanner } from '@/shared/ui/demo-banner';
import { ProfileDrawer, ProfileDrawerFallback } from '@/widgets/profile-drawer';
import './globals.css';
import { Providers } from './providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'FA',
  description: 'Deposit comparison by after-tax yield (demo data)',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* block, not flex: a flex column makes `mx-auto` children shrink-wrap their content */}
      <body className="min-h-full">
        <DemoDataBanner />
        <Providers>
          <header className="border-b border-divider">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
              <Link href="/" prefetch={false} className="text-lg font-semibold tracking-tight">
                FA<span className="sr-only"> home</span>
              </Link>
              {/* reads ?profile=: the fallback is prerendered, the route stays static */}
              <Suspense fallback={<ProfileDrawerFallback />}>
                <ProfileDrawer />
              </Suspense>
            </div>
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
