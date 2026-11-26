import type { Product } from '@fa/contracts';
import { reviewedProductIds } from '../../postgres/bank-products';
import { allyAdapter, readAlly } from './57803';
import { amexAdapter, readAmex } from './27471';
import { readTableConfig } from './config';
import { CONFIG_BANKS } from './configs';
import { verifiedByHuman, type BankExtract } from './normalize';

interface BankReader {
  institutionId: string;
  read(text: string, retrievedDay: string): BankExtract;
}

const READERS = new Map<string, BankReader>([
  [allyAdapter.sourceId, { institutionId: allyAdapter.institutionId, read: (t) => readAlly(t) }],
  [amexAdapter.sourceId, { institutionId: amexAdapter.institutionId, read: readAmex }],
  ...CONFIG_BANKS.map((config): [string, BankReader] => [
    `bank:${config.institutionId}`,
    { institutionId: config.institutionId, read: (t) => readTableConfig(config, t) },
  ]),
]);

function bankReader(sourceId: string): BankReader {
  const reader = READERS.get(sourceId);
  if (reader === undefined) throw new Error(`no bank adapter for ${sourceId}`);
  return reader;
}

/**
 * The products a bank review row lists, read again from that row's snapshot.
 * A person approved them, so they carry the bank's human verification date.
 * `retrievedDay` is the snapshot's day, not today.
 */
export function approvedBankRows(input: {
  sourceId: string;
  reason: string;
  snapshot: Uint8Array;
  retrievedDay: string;
  bankVerifiedAt: string;
}): { institutionId: string; rows: Product[]; snapshotIds: string[] } {
  const reader = bankReader(input.sourceId);
  const ids = new Set(reviewedProductIds(input.sourceId, input.reason));
  const extract = reader.read(new TextDecoder().decode(input.snapshot), input.retrievedDay);
  const rows = extract.products
    .filter((row) => ids.has(row.id))
    .map((row) => verifiedByHuman(row, input.bankVerifiedAt));
  const snapshotIds = extract.products.map((row) => row.id);
  return { institutionId: reader.institutionId, rows, snapshotIds };
}
