'use client';

// Document metadata and pdf.js load only while a citation is open (ADR-016).
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { documentQuery } from '@/entities/document/queries';
import type { CitationRef } from '@/features/open-citation';
import { ErrorState, Skeleton } from '@/shared/ui/states';

const Viewer = dynamic(() => import('./pdf-viewer').then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => <Skeleton label="Loading the document" className="h-96 w-full" />,
});

export function CitationPanel({
  current,
  onPage,
}: {
  current: CitationRef;
  onPage: (page: number) => void;
}) {
  const query = useQuery(documentQuery(current.documentId));
  if (query.isPending) return <Skeleton label="Loading the document" className="h-40 w-full" />;
  if (query.isError) return <ErrorState error={query.error} title="Document not found" />;

  const doc = query.data;
  const outside = current.page > doc.pages;
  const page = outside ? 1 : current.page;
  const quote = current.quote;

  return (
    <div className="flex flex-col gap-4">
      <blockquote className="border-l-2 border-border pl-3 text-sm">
        {quote === null ? 'No quote in this link.' : `“${quote}”`}
      </blockquote>
      <p className="text-sm text-muted">
        {doc.title}
        {doc.isSynthetic ? ' · Demo data' : ''}
      </p>
      {outside ? (
        <p role="status" className="text-sm">
          Page {String(current.page)} is outside this document ({String(doc.pages)} pages). Showing
          page 1.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-sm"
          disabled={page <= 1}
          onClick={() => {
            onPage(page - 1);
          }}
        >
          Previous page
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={page >= doc.pages}
          onClick={() => {
            onPage(page + 1);
          }}
        >
          Next page
        </button>
        <p className="text-sm">
          Page {String(page)} of {String(doc.pages)}
        </p>
      </div>
      <Viewer fileUrl={doc.fileUrl} pageNumber={page} pageCount={doc.pages} quote={quote} />
    </div>
  );
}
