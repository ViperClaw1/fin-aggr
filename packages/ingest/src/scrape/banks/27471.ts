import { parseAmexRates } from '../../banks/amex';
import {
  amexCdProduct,
  amexSavingsProduct,
  AMEX_SAVINGS_PAGE,
  type BankExtract,
} from './normalize';

/** American Express National Bank. Certificate from FDIC name search, 2026-11-13. */
export const amexAdapter = {
  cert: '27471',
  institutionId: 'fdic:27471',
  sourceId: 'bank:fdic:27471',
  url: 'https://functions.americanexpress.com/ReadBankingInterestRates.v1',
  kind: 'json' as const,
  jsonPath: 'interestRateList',
  timeZone: 'America/Denver',
};

/** Savings and CDs. The APY is the JSON rate. A CD penalty that the page does not state is not a product. */
export function readAmex(body: string, retrievedDay: string): BankExtract {
  const parsed = parseAmexRates(body, `${retrievedDay}T12:00:00.000Z`);
  if (parsed.kind === 'broken') throw new Error('amex rates payload is not the expected JSON');
  const products: BankExtract['products'][number][] = [];
  const extra = parsed.review.map((row) => ({
    key: row.bankType === '' ? 'amex:row' : `amex:${row.bankType}`,
    reasons: [row.reason],
  }));
  for (const offer of parsed.offers) {
    if (offer.bankType === AMEX_SAVINGS_PAGE.bankType) {
      products.push(amexSavingsProduct(offer));
      continue;
    }
    if (offer.category !== 'cd') continue;
    const cd = amexCdProduct(offer);
    if (cd === null) extra.push({ key: `amex:${offer.bankType}`, reasons: ['penalty'] });
    else products.push(cd);
  }
  return { products, extra };
}
