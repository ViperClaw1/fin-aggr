// The body of the system pages (not found, error): a temporary stub until they get their own design
// (T23). A server component; the error pages pass their retry button in as `action`.
import Link from 'next/link';
import type { ReactNode } from 'react';

interface SystemPageProps {
  code: string;
  title: string;
  text: string;
  action?: ReactNode;
}

export function SystemPage({ code, title, text, action }: SystemPageProps) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-16 sm:px-8 sm:py-24">
      <p className="text-sm font-medium text-muted tabular-nums">{code}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted">{text}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {action}
        <Link href="/" prefetch={false} className="btn">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
