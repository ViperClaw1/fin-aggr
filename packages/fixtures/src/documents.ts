// 8 synthetic documents (our own text, PDFs arrive in E6) and 5 facts per document (40 total).
import {
  IsoDate,
  type DocumentMeta,
  type FactRecord,
  type Institution,
  type Product,
} from '@fa/contracts';
import { PENALTY_PAGE } from './common';
import { penaltyQuote } from './products';
import type { Rng } from './prng';

const DOCUMENT_COUNT = 8;

const documentId = (i: number): string => `doc_${String(i + 1).padStart(2, '0')}`;

/** institutionId → document id for the first DOCUMENT_COUNT banks. */
export function documentPublishers(banks: readonly Institution[]): Map<string, string> {
  return new Map(banks.slice(0, DOCUMENT_COUNT).map((b, i) => [b.id, documentId(i)]));
}

export function generateDocuments(
  rng: Rng,
  publishers: ReadonlyMap<string, string>,
): DocumentMeta[] {
  return [...publishers].map(([institutionId, id]) => ({
    id,
    title: 'Deposit Account Agreement and Disclosures (synthetic)',
    publisherInstitutionId: institutionId,
    pages: rng.int(4, 16),
    fileUrl: `/mock-docs/${id}.pdf`,
    publishedAt: IsoDate.parse(`2026-0${String(rng.int(1, 9))}-15`),
    isSynthetic: true,
  }));
}

const OTHER_FACTS = [
  {
    key: 'achWithdrawalLimit',
    humanLabel: 'ACH withdrawal limit',
    valueText: '$25,000 per day',
    quote: 'Outgoing ACH transfers are limited to $25,000 per business day.',
  },
  {
    key: 'monthlyFee',
    humanLabel: 'Monthly maintenance fee',
    valueText: 'None',
    quote: 'There is no monthly maintenance fee for this account.',
  },
  {
    key: 'minBalanceForApy',
    humanLabel: 'Minimum balance to earn APY',
    valueText: '$0.01',
    quote: 'You must maintain a balance of at least $0.01 to earn the disclosed APY.',
  },
  {
    key: 'rateChangePolicy',
    humanLabel: 'Rate change policy',
    valueText: 'Variable; may change at any time',
    quote: 'The interest rate is variable and may change at our discretion at any time.',
  },
] as const;

export function generateFacts(
  documents: readonly DocumentMeta[],
  products: readonly Product[],
): FactRecord[] {
  return documents.flatMap((doc) => {
    const product = products.find((p) => p.institutionId === doc.publisherInstitutionId);
    const penalty = product?.earlyWithdrawal.value ?? { kind: 'none' };
    const common = { documentId: doc.id, status: 'unverified', isMock: true } as const;
    const penaltyFact: FactRecord = {
      ...common,
      id: `fact_${doc.id}_penalty`,
      productId: product?.id ?? null,
      key: 'earlyWithdrawalPenalty',
      humanLabel: 'Early withdrawal penalty',
      valueText: penalty.kind.replaceAll('_', ' '),
      page: PENALTY_PAGE,
      quote: penaltyQuote(penalty),
    };
    const others = OTHER_FACTS.map((f, k): FactRecord => ({
      ...common,
      ...f,
      id: `fact_${doc.id}_${String(k + 1)}`,
      productId: null,
      page: Math.min(doc.pages, PENALTY_PAGE + k + 1),
    }));
    return [penaltyFact, ...others];
  });
}
