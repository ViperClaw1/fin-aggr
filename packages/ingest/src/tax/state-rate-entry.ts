/** One draft 2026 state rate on interest income, before confirmation (P1.4, ADR-025). */
export interface StateRateEntry {
  state: string;
  kind: 'none' | 'flat' | 'top';
  /** percent as printed by the source, '0' for no tax */
  percent: string;
  sourceUrl: string;
  quote: string;
  zeroUpTo?: string;
  note?: string;
}
