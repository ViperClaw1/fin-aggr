// URL state of the citation viewer, ?doc=&page=&q= (spec §2 CitationViewerHost). Opening pushes a
// history entry, so Back closes the viewer. The quote is plain text, rendered as a string, never HTML.
import { Id } from '@fa/contracts';
import { createLoader, createParser, createSerializer, type inferParserType } from 'nuqs';

const MAX_PAGE = 9999;
const MAX_QUOTE = 400;

const doc = createParser<Id>({
  parse: (value) => {
    const parsed = Id.safeParse(value);
    return parsed.success ? parsed.data : null;
  },
  serialize: (id) => id,
});

const page = createParser<number>({
  parse: (value) => {
    if (!/^\d{1,4}$/.test(value)) return null;
    const n = Number(value);
    return n >= 1 && n <= MAX_PAGE ? n : null;
  },
  serialize: String,
}).withDefault(1);

const q = createParser<string>({
  parse: (value) => {
    const text = value.trim();
    return text === '' || text.length > MAX_QUOTE ? null : text;
  },
  serialize: (text) => text,
});

export const citationParsers = {
  doc: doc.withOptions({ history: 'push' }),
  page: page.withOptions({ history: 'push' }),
  q: q.withOptions({ history: 'push' }),
};
export const CITATION_KEYS = Object.keys(citationParsers) as (keyof typeof citationParsers)[];

export interface CitationRef {
  documentId: Id;
  page: number;
  quote: string | null;
}

const loadRaw = createLoader(citationParsers);
const serialize = createSerializer(citationParsers);

/** The open citation, or null: without a document the other keys mean nothing. */
function citationFrom(values: inferParserType<typeof citationParsers>): CitationRef | null {
  return values.doc === null
    ? null
    : { documentId: values.doc, page: values.page, quote: values.q };
}

export const loadCitation = (params: URLSearchParams): CitationRef | null =>
  citationFrom(loadRaw(params));

/** The query string that opens `ref`, or clears all three keys for null. */
export const citationUrl = (base: string, ref: CitationRef | null): string =>
  serialize(
    base,
    ref === null
      ? { doc: null, page: null, q: null }
      : { doc: ref.documentId, page: ref.page, q: ref.quote },
  );
