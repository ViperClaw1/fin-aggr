import type { DatasetDomain } from '@fa/contracts';

/** Treasury stays on its domain. A scraped bank rate uses bank_products. Demo rows stay on products. */
export function productDatasetDomain(product: {
  category: string;
  provenance: { isMock: boolean; sourceId: string };
}): DatasetDomain {
  if (product.category === 'treasury') return 'treasury';
  if (!product.provenance.isMock && product.provenance.sourceId.startsWith('bank:')) {
    return 'bank_products';
  }
  return 'products';
}
