import { CodedError } from '../fetch-budget';

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
/** `2026-22495`, or a correction prefix such as the live `C1-2025-19864`. */
const DOCUMENT_NUMBER = /^(?:[A-Z]\d-)?\d{4}-\d+$/;

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

/** An empty `results` array is a normal day, not a broken response. */
export function registerEnvelopeProblems(body: unknown): string[] {
  if (!isRecord(body)) return ['body'];
  if (!Array.isArray(body['results'])) return ['results'];
  return [];
}

type NoticeCode = 'fr_invalid_number' | 'fr_invalid_date' | 'fr_invalid_title' | 'fr_invalid_url';

function noticeCode(item: Record<string, unknown>): NoticeCode | null {
  const documentNumber = item['document_number'];
  if (typeof documentNumber !== 'string' || !DOCUMENT_NUMBER.test(documentNumber)) {
    return 'fr_invalid_number';
  }
  const publicationDate = item['publication_date'];
  if (typeof publicationDate !== 'string' || !DATE.test(publicationDate)) return 'fr_invalid_date';
  const title = item['title'];
  if (typeof title !== 'string' || title.trim() === '') return 'fr_invalid_title';
  const url = item['html_url'];
  if (typeof url !== 'string' || !registerUrl(url)) return 'fr_invalid_url';
  return null;
}

function registerUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.host === 'www.federalregister.gov';
  } catch {
    return false;
  }
}

function noticeFrom(item: Record<string, unknown>): RegisterNotice {
  const documentNumber = item['document_number'];
  const publicationDate = item['publication_date'];
  const title = item['title'];
  const url = item['html_url'];
  if (
    typeof documentNumber !== 'string' ||
    typeof publicationDate !== 'string' ||
    typeof title !== 'string' ||
    typeof url !== 'string'
  ) {
    throw new CodedError('fr_invalid_number');
  }
  return { documentNumber, publicationDate, title: title.trim(), url };
}

/**
 * Keeps valid rows. One bad row is skipped. More than half the page, or a body that is
 * not a results envelope, fails with a code and the agency slug.
 */
export function parseRegisterDocuments(body: unknown, agency = ''): RegisterNotice[] {
  if (registerEnvelopeProblems(body).length > 0) throw new CodedError('fr_envelope', agency);
  if (!isRecord(body) || !Array.isArray(body['results']))
    throw new CodedError('fr_envelope', agency);
  const results = body['results'] as readonly unknown[];
  const notices: RegisterNotice[] = [];
  let invalid = 0;
  let code: NoticeCode = 'fr_invalid_number';
  for (const item of results) {
    if (!isRecord(item)) {
      invalid += 1;
      continue;
    }
    const problem = noticeCode(item);
    if (problem !== null) {
      invalid += 1;
      code = problem;
      continue;
    }
    notices.push(noticeFrom(item));
  }
  if (results.length > 0 && invalid * 2 > results.length) throw new CodedError(code, agency);
  return notices;
}

/** The page text is stored raw. JSON that is not an object fails as `json_invalid`. */
export function readRegisterPage(text: string, agency: string): RegisterNotice[] {
  try {
    return parseRegisterDocuments(JSON.parse(text) as unknown, agency);
  } catch (error) {
    if (error instanceof SyntaxError) throw new CodedError('json_invalid', agency);
    throw error;
  }
}
