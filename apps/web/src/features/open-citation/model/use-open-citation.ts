'use client';

// Writes ?doc=&page=&q= (spec §6). The viewer that reads it arrives in E6; until then the URL is
// the whole effect. The caller sits inside <Suspense> (URL state).
import type { Id } from '@fa/contracts';
import { useQueryStates } from 'nuqs';
import { citationParsers, type CitationRef } from './search-params';

export interface OpenCitation {
  documentId: Id;
  page: number;
  quote: string;
}

export function useOpenCitation() {
  const [values, setValues] = useQueryStates(citationParsers);
  const current: CitationRef | null =
    values.doc === null ? null : { documentId: values.doc, page: values.page, quote: values.q };
  const open = (ref: OpenCitation) => {
    void setValues({ doc: ref.documentId, page: ref.page, q: ref.quote });
  };
  const close = () => {
    void setValues({ doc: null, page: null, q: null });
  };
  return { current, open, close };
}
