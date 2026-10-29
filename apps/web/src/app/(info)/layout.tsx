import type { ReactNode } from 'react';

// Text pages: methodology, disclosure, privacy. Drafts written by us; the final wording comes after
// a legal review (spec §9 item 7), so every page says it is a draft.
export default function InfoLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
      <p
        role="note"
        className="mb-6 rounded-md border border-warn bg-warn-bg px-3 py-2 text-sm text-warn"
      >
        Draft, pending legal review.
      </p>
      <article className="flex flex-col gap-4 leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight sm:[&_h1]:text-3xl [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1">
        {children}
      </article>
    </main>
  );
}
