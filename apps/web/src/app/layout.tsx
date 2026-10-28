import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { DemoDataBanner } from '@/shared/ui/demo-banner';
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
