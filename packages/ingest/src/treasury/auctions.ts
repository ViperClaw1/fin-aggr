import { sha256Hex } from '../pipeline';

/**
 * Fiscal Data auctions and TreasuryDirect auctioned securities.
 * Read 2026-11-13. Neither response has a balance tier, an early-withdrawal
 * penalty, an eligibility rule, or a tax treatment, so no Product is built.
 */

const FISCAL =
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query?sort=-auction_date&page[size]=1';

const DIRECT = 'https://www.treasurydirect.gov/TA_WS/securities/auctioned?format=json&pagesize=1';

const TREASURY_USER_AGENT = 'FA (+https://fin-aggr.vercel.app)';

const FISCAL_FIELDS = [
  'cusip',
  'security_type',
  'security_term',
  'issue_date',
  'maturity_date',
  'high_yield',
  'int_rate',
  'int_payment_frequency',
  'min_to_issue',
] as const;

const DIRECT_FIELDS = [
  'cusip',
  'securityType',
  'securityTerm',
  'issueDate',
  'maturityDate',
  'highRate',
  'investmentRate',
  'interestRate',
  'frequencyOfInterestPayments',
  'minimumToIssueAmount',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function fiscalShapeProblems(body: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return ['json'];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['data']) || parsed['data'].length === 0) {
    return ['data'];
  }
  const row: unknown = parsed['data'][0];
  if (!isRecord(row)) return ['data'];
  return FISCAL_FIELDS.filter((field) => !(field in row));
}

export function directShapeProblems(body: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return ['json'];
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return ['data'];
  const row: unknown = parsed[0];
  if (!isRecord(row)) return ['data'];
  return DIRECT_FIELDS.filter((field) => !(field in row));
}

export async function fetchAuctionBody(input: {
  fetchImpl: typeof fetch;
  requestSignal: () => AbortSignal;
  url: string;
}): Promise<{ sha256: string; bytes: Uint8Array; body: string; requestCount: number }> {
  const response = await input.fetchImpl(input.url, {
    signal: input.requestSignal(),
    headers: { accept: 'application/json', 'user-agent': TREASURY_USER_AGENT },
  });
  if (!response.ok) throw new Error(`treasury http ${String(response.status)}`);
  const body = await response.text();
  const bytes = new TextEncoder().encode(body);
  return { sha256: sha256Hex(bytes), bytes, body, requestCount: 1 };
}

export const FISCAL_URL = FISCAL;
export const DIRECT_URL = DIRECT;

export async function checkFiscalShape(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(FISCAL, {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/json', 'user-agent': TREASURY_USER_AGENT },
  });
  if (!response.ok) return `treasury fiscal data shape http ${String(response.status)}`;
  const problems = fiscalShapeProblems(await response.text());
  if (problems.length > 0) return `treasury fiscal data shape ${problems.join(' ')}`;
  return 'treasury fiscal data shape ok';
}

export async function checkDirectShape(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(DIRECT, {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/json', 'user-agent': TREASURY_USER_AGENT },
  });
  if (!response.ok) return `treasurydirect shape http ${String(response.status)}`;
  const problems = directShapeProblems(await response.text());
  if (problems.length > 0) return `treasurydirect shape ${problems.join(' ')}`;
  return 'treasurydirect shape ok';
}
