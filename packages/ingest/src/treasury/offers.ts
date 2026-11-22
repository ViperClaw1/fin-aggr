import { parseCents, type Cents, type Rate } from '@fa/contracts';
import { billApy, noteApy } from './apy';

/**
 * TreasuryDirect auctioned securities → the latest auction per published term (owner decisions
 * 2026-11-22): bills of 13, 26 and 52 weeks and notes of 2, 3, 5, 7 and 10 years. TIPS, FRNs,
 * cash management bills, bonds and odd terms are left out. A reopened bill stays in: its price
 * and dates are that auction's own (every 13-week bill is a reopening).
 */

const TERM_MONTHS: Readonly<Record<string, number>> = {
  'Bill 13-Week': 3,
  'Bill 26-Week': 6,
  'Bill 52-Week': 12,
  'Note 2-Year': 24,
  'Note 3-Year': 36,
  'Note 5-Year': 60,
  'Note 7-Year': 84,
  'Note 10-Year': 120,
};

export interface TreasuryOffer {
  cusip: string;
  securityType: 'Bill' | 'Note';
  securityTerm: string;
  termMonths: number;
  issueDate: string;
  maturityDate: string;
  daysToMaturity: number;
  apy: Rate;
  /** "Minimum To Bid Amount", whole dollars, 31 CFR 356.12(a) */
  minOpening: Cents;
  /** "Maximum Noncompetitive Award" */
  maxDeposit: Cents;
  compounding: 'at_maturity' | 'semiannual';
}

export type Row = Record<string, unknown>;

export function text(row: Row, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isoDate(row: Row, key: string): string {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(text(row, key))?.[0];
  if (date === undefined) throw new Error(`treasury ${key} missing on ${text(row, 'cusip')}`);
  return date;
}

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  if (!Number.isSafeInteger(days) || days <= 0) throw new Error(`bad term ${from}..${to}`);
  return days;
}

export function eligible(row: Row): boolean {
  return (
    `${text(row, 'securityType')} ${text(row, 'securityTerm')}` in TERM_MONTHS &&
    text(row, 'inflationProtected') !== 'Yes' &&
    text(row, 'floatingRate') !== 'Yes' &&
    text(row, 'cashManagementBill') !== 'Yes'
  );
}

/** An announced auction without results has no price or yield yet: not an offer. */
export function hasResult(row: Row): boolean {
  return text(row, 'securityType') === 'Bill'
    ? text(row, 'highPrice') !== ''
    : text(row, 'highYield') !== '';
}

function toOffer(row: Row): TreasuryOffer {
  const securityType = text(row, 'securityType') === 'Bill' ? 'Bill' : 'Note';
  const securityTerm = text(row, 'securityTerm');
  const issueDate = isoDate(row, 'issueDate');
  const maturityDate = isoDate(row, 'maturityDate');
  const daysToMaturity = daysBetween(issueDate, maturityDate);
  return {
    cusip: text(row, 'cusip'),
    securityType,
    securityTerm,
    termMonths: TERM_MONTHS[`${securityType} ${securityTerm}`] ?? 0,
    issueDate,
    maturityDate,
    daysToMaturity,
    apy:
      securityType === 'Bill'
        ? billApy(text(row, 'highPrice'), daysToMaturity)
        : noteApy(text(row, 'highYield')),
    minOpening: parseCents(text(row, 'minimumToBidAmount')),
    maxDeposit: parseCents(text(row, 'maximumNoncompetitiveAward')),
    compounding: securityType === 'Bill' ? 'at_maturity' : 'semiannual',
  };
}

/** One offer per term: the newest issue date with results. Order is by term. */
export function latestOffers(body: string): TreasuryOffer[] {
  const parsed: unknown = JSON.parse(body);
  if (!Array.isArray(parsed)) throw new Error('treasurydirect body is not an array');
  const latest = new Map<string, Row>();
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Row;
    if (!eligible(row) || !hasResult(row)) continue;
    const key = `${text(row, 'securityType')} ${text(row, 'securityTerm')}`;
    const held = latest.get(key);
    if (held === undefined || isoDate(row, 'issueDate') > isoDate(held, 'issueDate')) {
      latest.set(key, row);
    }
  }
  return [...latest.values()].map(toOffer).sort((a, b) => a.termMonths - b.termMonths);
}
