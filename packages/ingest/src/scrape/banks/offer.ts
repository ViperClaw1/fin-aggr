/** A rate card after HTML extraction, before it becomes a Product. */
export interface HtmlOffer {
  name: string;
  category: 'cd' | 'savings';
  termMonths: number | null;
  apyPercent: string;
  asOf: string;
  minDollars: string;
  compounding: 'daily' | 'monthly';
  penaltyDays: number | null;
  quote: string;
}
