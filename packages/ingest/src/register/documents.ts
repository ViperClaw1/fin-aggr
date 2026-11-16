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

export interface CfrReference {
  title: number;
  part: number;
}

export interface RegisterNotice {
  documentNumber: string;
  publicationDate: string;
  title: string;
  url: string;
  cfrReferences: readonly CfrReference[];
}

/** Parts the daily watch is for, plus IRS interest reporting. */
const WATCHED_CFR_PARTS = new Set([328, 330, 745, 1030]);

const WATCHED_PART = /\b(?:328|330|745|1030)\b/;
const FORM_1099_INT = /\b1099[-\s]?INT\b/i;
const IRS_INTEREST = /\binterest\b/i;
const IRS_REPORTING = /\b(?:1099|information reporting)\b/i;

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
  return {
    documentNumber,
    publicationDate,
    title: title.trim(),
    url,
    cfrReferences: cfrReferences(item),
  };
}

function cfrReferences(item: Record<string, unknown>): CfrReference[] {
  const raw = item['cfr_references'];
  if (!Array.isArray(raw)) return [];
  const refs: CfrReference[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const title = wholeNumber(entry['title']);
    const part = wholeNumber(entry['part']);
    if (title === null || part === null) continue;
    refs.push({ title, part });
  }
  return refs;
}

function wholeNumber(value: unknown): number | null {
  const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : '';
  if (!/^[1-9]\d{0,4}$/.test(text)) return null;
  return Number(text);
}

function titleCitesWatchedPart(title: string): boolean {
  const mention = /\b12\s*C\.?\s*F\.?\s*R\.?\s*([^;\n]*)/gi;
  for (const match of title.matchAll(mention)) {
    if (WATCHED_PART.test(match[1] ?? '')) return true;
  }
  return false;
}

/** True when the title or a CFR reference is one of the parts this watch exists for. */
export function isLikelyRelevant(notice: RegisterNotice): boolean {
  if (notice.cfrReferences.some((ref) => ref.title === 12 && WATCHED_CFR_PARTS.has(ref.part))) {
    return true;
  }
  if (titleCitesWatchedPart(notice.title)) return true;
  if (FORM_1099_INT.test(notice.title)) return true;
  return IRS_INTEREST.test(notice.title) && IRS_REPORTING.test(notice.title);
}

function registerLine(notice: RegisterNotice): string {
  const flag = isLikelyRelevant(notice) ? 'likely relevant ' : '';
  return `${flag}${notice.documentNumber} ${notice.publicationDate} ${notice.title} ${notice.url}`;
}

/** Likely-relevant documents are listed first and prefixed so they stand out. */
export function formatRegisterIssue(notices: readonly RegisterNotice[]): string {
  const ordered = notices.map((notice, index) => ({ notice, index }));
  ordered.sort((a, b) => {
    const rank = Number(isLikelyRelevant(b.notice)) - Number(isLikelyRelevant(a.notice));
    return rank === 0 ? a.index - b.index : rank;
  });
  return ['Documents:', ...ordered.map(({ notice }) => registerLine(notice))].join('\n');
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
