// Products and tax tables for the after-tax comparison, loaded at build (ADR-016).
import { type Product, type TaxTables } from '@fa/contracts';
import { cacheLife } from 'next/cache';
import { productsQuery } from '@/entities/product/queries';
import { taxTablesQuery } from '@/entities/reference/queries';
import { TAX_YEAR } from '@/shared/config';
import { makeQueryClient } from '@/shared/lib/query-client';

export interface YieldData {
  products: Record<'cd' | 'savings' | 'treasury', Product[]>;
  taxTables: TaxTables;
}

export async function loadYieldData(): Promise<YieldData> {
  'use cache';
  cacheLife('max');
  const client = makeQueryClient();
  const [taxTables, cd, savings, treasury] = await Promise.all([
    client.query(taxTablesQuery(TAX_YEAR)),
    client.query(productsQuery({ category: 'cd', limit: 100 })),
    client.query(productsQuery({ category: 'savings', limit: 100 })),
    client.query(productsQuery({ category: 'treasury', limit: 100 })),
  ]);
  return {
    products: { cd: cd.items, savings: savings.items, treasury: treasury.items },
    taxTables,
  };
}
