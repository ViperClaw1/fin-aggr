import { parseAmexRates } from '../../banks/amex';
import { amexSavingsProduct, AMEX_SAVINGS_PAGE, type BankExtract } from './normalize';

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

/** Savings from the JSON. CD rows have no penalty in this payload, so they are not products. */
export function readAmex(body: string, retrievedDay: string): BankExtract {
  const parsed = parseAmexRates(body, `${retrievedDay}T12:00:00.000Z`);
  if (parsed.kind === 'broken') throw new Error('amex rates payload is not the expected JSON');
  const products = parsed.offers
    .filter((offer) => offer.bankType === AMEX_SAVINGS_PAGE.bankType)
    .map((offer) => amexSavingsProduct(offer));
  return {
    products,
    extra: parsed.review.map((row) => ({
      key: row.bankType === '' ? 'amex:row' : `amex:${row.bankType}`,
      reasons: [row.reason],
    })),
  };
}
