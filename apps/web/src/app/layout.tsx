import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import Script from 'next/script';
import { Suspense } from 'react';
import { ThemeToggle } from '@/features/toggle-theme';
import { env, PROFILE_STORAGE_KEY } from '@/shared/config';
import { DemoDataBanner } from '@/shared/ui/demo-banner';
import { ProfileDrawer, ProfileDrawerFallback } from '@/widgets/profile-drawer';
import { SiteFooter } from '@/widgets/site-footer';
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

const DESCRIPTION =
  'Compare CDs, savings accounts and Treasuries by what you keep after tax. Demo data.';

// Pages set their own title, description and canonical path; the rest is inherited. noindex while
// the data is synthetic (decided 2026-10-29): no made-up rates in search results. OG images come
// from the opengraph-image files.
export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: 'FA · Compare deposits after tax', template: '%s · FA' },
  description: DESCRIPTION,
  applicationName: 'FA',
  robots: { index: false, follow: false },
  openGraph: { type: 'website', siteName: 'FA', locale: 'en_US', description: DESCRIPTION },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  // light is the default theme whatever the system says (globals.css); the dark one is opt-in
  colorScheme: 'light',
  themeColor: '#ffffff',
};

/** Sets data-has-profile before first paint when a draft is stored. Sees presence only (ADR-017). */
const profilePresenceScript = `try{if(localStorage.getItem(${JSON.stringify(PROFILE_STORAGE_KEY)}))document.documentElement.setAttribute("data-has-profile","")}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* block, not flex: a flex column makes `mx-auto` children shrink-wrap their content */}
      <body className="min-h-full">
        <Script id="profile-presence" strategy="beforeInteractive">
          {profilePresenceScript}
        </Script>
        <DemoDataBanner />
        <Providers>
          <header className="border-b border-divider">
            <div className="mx-auto flex h-14 max-w-page items-center justify-between gap-3 px-4 sm:px-8">
              <Link href="/" prefetch={false} className="text-lg font-semibold tracking-tight">
                FA<span className="sr-only"> home</span>
              </Link>
              {/* reads ?profile=: the fallback is prerendered, the route stays static */}
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Suspense fallback={<ProfileDrawerFallback />}>
                  <ProfileDrawer />
                </Suspense>
              </div>
            </div>
          </header>
          {children}
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
