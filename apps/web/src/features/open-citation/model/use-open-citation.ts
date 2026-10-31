'use client';

// Writes ?doc=&page=&q= (spec §6). History matches the profile drawer (shared/lib/overlay-history):
// the first open pushes, a page change replaces, closing steps back. The caller sits inside
// <Suspense> (URL state).
import type { Id } from '@fa/contracts';
import { useQueryStates } from 'nuqs';
import { createOverlayHistory } from '@/shared/lib/overlay-history';
import { citationParsers, type CitationRef } from './search-params';

export interface OpenCitation {
  documentId: Id;
  page: number;
  quote: string;
}

const overlay = createOverlayHistory();

export function useOpenCitation() {
  const [values, setValues] = useQueryStates(citationParsers);
  const current: CitationRef | null =
    values.doc === null ? null : { documentId: values.doc, page: values.page, quote: values.q };
  const open = (ref: OpenCitation) => {
    void setValues(
      { doc: ref.documentId, page: ref.page, q: ref.quote },
      { history: overlay.open(values.doc === null) },
    );
  };
  const setPage = (page: number) => {
    if (values.doc === null) return;
    void setValues({ page }, { history: 'replace' });
  };
  const close = () => {
    const action = overlay.close(values.doc !== null);
    if (action === 'back') window.history.back();
    else if (action === 'replace') {
      void setValues({ doc: null, page: null, q: null }, { history: 'replace' });
    }
  };
  return { current, open, close, setPage };
}
