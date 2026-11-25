import { parseRate, Provenance, type TaxTables } from '@fa/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMockGateway } from '@/shared/api/gateway.mock';
import { TAX_YEAR } from '@/shared/config';
import { stateTaxProvenance } from './tax-sources';

let tables: TaxTables;
beforeAll(async () => {
  const gw = createMockGateway({ seed: 20261025, latency: 'none', failureRate: 0 });
  tables = await gw.getTaxTables(TAX_YEAR);
});

const own = (sourceId: string): Provenance =>
  Provenance.parse({
    sourceId,
    sourceUrl: 'https://example.gov/tax',
    retrievedAt: '2026-11-20T00:00:00.000Z',
    verification: { status: 'unverified' },
    isMock: false,
  });

describe('state tax source', () => {
  it('uses the table source when no state source is given', () => {
    const plain: TaxTables = {
      ...tables,
      states: { CA: { assumedMarginalRate: parseRate('0.093') } },
    };
    delete plain.statesProvenance;
    const ca = plain;
    expect(stateTaxProvenance(ca, 'CA')).toBe(plain.provenance);
  });

  it('prefers the shared state source, then the state own source', () => {
    const shared = own('states');
    const ca = own('ca-ftb');
    const base = { ...tables, statesProvenance: shared };
    const rate = parseRate('0.093');
    expect(
      stateTaxProvenance({ ...base, states: { CA: { assumedMarginalRate: rate } } }, 'CA'),
    ).toBe(shared);
    expect(
      stateTaxProvenance(
        { ...base, states: { CA: { assumedMarginalRate: rate, provenance: ca } } },
        'CA',
      ),
    ).toBe(ca);
  });

  it('has no source for a state the table does not list', () => {
    expect(stateTaxProvenance({ ...tables, states: {} }, 'TX')).toBeNull();
  });
});
