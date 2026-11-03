import type { Product } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { createMockGateway } from '@/shared/api/gateway.mock';
import { TAX_YEAR } from '@/shared/config';
import { packCompareProducts, unpackCompareProducts, type CompareProduct } from './wire';

const gw = createMockGateway({ seed: 20261025, latency: 'none', failureRate: 0 });

function kept(p: Product): CompareProduct {
  return {
    id: p.id,
    institutionId: p.institutionId,
    category: p.category,
    name: p.name,
    termMonths: p.termMonths,
    tierMode: p.tierMode,
    tiers: p.tiers,
    taxTreatment: p.taxTreatment,
    minOpening: p.minOpening,
    maxDeposit: p.maxDeposit,
    earlyWithdrawal: p.earlyWithdrawal,
    eligibility: p.eligibility,
    provenance: p.provenance,
  };
}

describe('compare wire', () => {
  it('round-trips the fields the row and the engine read', async () => {
    const cds = (await gw.listProducts({ category: 'cd' })).items;
    const back = unpackCompareProducts(packCompareProducts(cds, 'cd'));
    expect(back).toEqual(cds.map(kept));
    const first = back[0];
    const twin = back.find(
      (p, i) => i > 0 && JSON.stringify(p.eligibility) === JSON.stringify(first?.eligibility),
    );
    expect(twin?.eligibility).toBe(first?.eligibility);
  });

  it('keeps the compare props under 40 KB for the largest category', async () => {
    const [cds, institutions, taxTables, dataset] = await Promise.all([
      gw.listProducts({ category: 'cd' }),
      gw.listInstitutions({ limit: 100 }),
      gw.getTaxTables(TAX_YEAR),
      gw.getDatasetInfo(),
    ]);
    const payload = {
      products: packCompareProducts(cds.items, 'cd'),
      institutions: institutions.items.map(({ id, name, kind, partnerInstitutionIds }) => ({
        id,
        name,
        kind,
        partnerInstitutionIds,
      })),
      taxTables,
      dataset,
    };
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(40 * 1024);
  });

  it('refuses to pack two categories into one page', async () => {
    const cds = (await gw.listProducts({ category: 'cd' })).items;
    expect(() => packCompareProducts(cds, 'savings')).toThrow(/mixes categories/);
  });
});
