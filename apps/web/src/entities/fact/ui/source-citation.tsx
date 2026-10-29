'use client';

import type { Id, Provenance } from '@fa/contracts';
import { Disclosure } from '@/shared/ui/disclosure';
import { absoluteDate, FreshnessLabel } from '@/shared/ui/freshness';
import { sourceDomain, verificationText } from '../model/citation';

interface CitationRef {
  documentId: Id;
  page: number;
  quote: string;
}

export interface SourceCitationProps {
  provenance: Provenance;
  variant?: 'chip' | 'inline';
  /** Opens the document viewer (features/open-citation writes the URL). */
  onOpen?: (ref: CitationRef) => void;
  /** Without it the retrieval date is shown as an absolute date. */
  now?: Date;
}

/** Source, page, verification and demo status, all in words. Not inside <p> (it holds <details>). */
export function SourceCitation({
  provenance: p,
  variant = 'chip',
  onOpen,
  now,
}: SourceCitationProps) {
  const domain = sourceDomain(p.sourceUrl);
  const doc = p.document;
  const where = doc === undefined ? domain : `${domain}, p. ${String(doc.page)}`;
  const box =
    variant === 'chip'
      ? 'inline-flex flex-wrap items-center gap-x-2 rounded-sm border border-border px-2 py-0.5 text-xs'
      : 'inline-flex flex-wrap items-center gap-x-2 text-xs';
  return (
    <div className={box} data-citation={p.sourceId}>
      {doc !== undefined && onOpen !== undefined ? (
        <button
          type="button"
          onClick={() => {
            onOpen({ documentId: doc.id, page: doc.page, quote: doc.quote });
          }}
          className="text-accent underline"
        >
          {where}
        </button>
      ) : (
        <a
          href={p.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline"
        >
          {where}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      <span>{verificationText(p.verification)}</span>
      {p.isMock ? <span className="font-medium">Demo data</span> : null}
      {now === undefined ? (
        <time dateTime={p.retrievedAt} className="text-muted">
          Retrieved {absoluteDate(p.retrievedAt)}
        </time>
      ) : (
        <FreshnessLabel at={p.retrievedAt} now={now} />
      )}
      {doc === undefined ? null : (
        <Disclosure summary="Quote" label={`from ${where}`}>
          <blockquote>“{doc.quote}”</blockquote>
        </Disclosure>
      )}
    </div>
  );
}
