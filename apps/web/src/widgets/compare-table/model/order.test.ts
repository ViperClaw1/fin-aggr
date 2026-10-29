import { compareRate, Profile, type Product, type TaxTables } from '@fa/contracts';
import { rankProducts } from '@fa/engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { headlineApy } from '@/entities/product';
import { createMockGateway } from '@/shared/api/gateway.mock';
import { TAX_YEAR } from '@/shared/config';
import { defaultOrder } from './order';

let cds: Product[];
let tables: TaxTables;
beforeAll(async () => {
  const gw = createMockGateway({ seed: 20261025, latency: 'none', failureRate: 0 });
  cds = (await gw.listProducts({ category: 'cd' })).items;
  tables = await gw.getTaxTables(TAX_YEAR);
});

const profile = Profile.parse({
  version: 1,
  taxYear: TAX_YEAR,
  filingStatus: 'single',
  stateCode: 'NY',
  taxableIncome: 8500000,
  cityMarginalRate: '0.03',
  residency: 'us_citizen',
  age: 40,
  scenario: { principal: 2500000, holdingMonths: 12 },
});

describe('defaultOrder', () => {
  it('without a profile, ranks by top APY, highest first', () => {
    const rows = defaultOrder(cds, null);
    expect(rows).toHaveLength(60);
    for (let i = 1; i < rows.length; i++) {
      const prev = headlineApy(rows[i - 1]!.product);
      expect(compareRate(prev, headlineApy(rows[i]!.product))).toBeGreaterThanOrEqual(0);
    }
  });
  it('with a profile, follows rankProducts on the same data', () => {
    const ranked = rankProducts(cds, profile, tables);
    expect(defaultOrder(cds, ranked).map((r) => r.product.id)).toEqual(
      ranked.map((r) => r.productId),
    );
  });
  it('drops ranked entries whose product was filtered out', () => {
    const ranked = rankProducts(cds, profile, tables);
    expect(defaultOrder(cds.slice(0, 10), ranked)).toHaveLength(10);
  });
});
