/**
 * Call-report amounts in this ZIP are whole dollars (AcctDesc says "dollar amount").
 * `total_assets_usd_thousands` stores thousands. Half-up, integer division, no float.
 */
export function thousandsFromDollars(digits: string): number {
  if (!/^\d+$/.test(digits) || digits.length > 15) throw new Error('ncua amount');
  const dollars = BigInt(digits);
  const thousands = (dollars + 500n) / 1000n;
  if (thousands > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('ncua amount');
  return Number(thousands);
}
