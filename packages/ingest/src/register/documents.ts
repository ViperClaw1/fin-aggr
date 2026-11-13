/**
 * Federal Register API v1. Agency slugs are the `slug` values from
 * `/api/v1/agencies.json` (read 2026-11-10). No API key.
 */
export const REGISTER_AGENCIES = [
  'federal-deposit-insurance-corporation',
  'national-credit-union-administration',
  'consumer-financial-protection-bureau',
  'internal-revenue-service',
] as const;

type RegisterAgency = (typeof REGISTER_AGENCIES)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOCUMENT_NUMBER = /^\d{4}-\d+$/;

export interface RegisterNotice {
  documentNumber: string;
  publicationDate: string;
  title: string;
  url: string;
}

export function documentsUrl(agency: RegisterAgency, perPage: number): string {
  const params = new URLSearchParams();
  params.append('conditions[agencies][]', agency);
  params.set('per_page', String(perPage));
  params.set('order', 'newest');
  return `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `Array.isArray` narrows to `any[]`. The assertion puts the element back on `unknown`. */
function firstItem(value: unknown): unknown {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const items = value as readonly unknown[];
  return items[0];
}

/** An empty `results` array is a normal day, not a broken response. */
export function registerEnvelopeProblems(body: unknown): string[] {
  if (!isRecord(body)) return ['body'];
  if (!Array.isArray(body['results'])) return ['results'];
  const first = firstItem(body['results']);
  if (first === undefined) return [];
  if (!isRecord(first)) return ['results.0'];
  const problems: string[] = [];
  if (typeof first['document_number'] !== 'string') problems.push('document_number');
  if (typeof first['publication_date'] !== 'string') problems.push('publication_date');
  if (typeof first['title'] !== 'string') problems.push('title');
  if (typeof first['html_url'] !== 'string') problems.push('html_url');
  return problems;
}

function noticeFrom(item: Record<string, unknown>): RegisterNotice {
  const documentNumber = item['document_number'];
  const publicationDate = item['publication_date'];
  const title = item['title'];
  const url = item['html_url'];
  if (
    typeof documentNumber !== 'string' ||
    !DOCUMENT_NUMBER.test(documentNumber) ||
    typeof publicationDate !== 'string' ||
    !DATE.test(publicationDate) ||
    typeof title !== 'string' ||
    title.trim() === '' ||
    typeof url !== 'string'
  ) {
    throw new Error('federal register invalid');
  }
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.host !== 'www.federalregister.gov') {
    throw new Error('federal register invalid');
  }
  return {
    documentNumber,
    publicationDate,
    title: title.trim(),
    url,
  };
}

/** Number, date, title, and URL only. Abstract and excerpts are not copied. */
export function parseRegisterDocuments(body: unknown): RegisterNotice[] {
  const problems = registerEnvelopeProblems(body);
  if (problems.length > 0) throw new Error(`federal register invalid: ${problems.join(' ')}`);
  if (!isRecord(body) || !Array.isArray(body['results']))
    throw new Error('federal register invalid');
  return body['results'].map((item) => {
    if (!isRecord(item)) throw new Error('federal register invalid');
    return noticeFrom(item);
  });
}
