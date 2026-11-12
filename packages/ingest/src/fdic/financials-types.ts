import type { BankMetrics } from '@fa/contracts';

export interface FdicFinancialsRaw {
  retrievedAt: string;
  responses: readonly { url: string; body: string }[];
}

export interface CallReport {
  report: BankMetrics;
  depositsUsdThousands: number | null;
}
