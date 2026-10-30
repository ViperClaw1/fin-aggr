import { isId } from '@fa/contracts';
import { OG_SIZE, ogCard } from '../../og-card';
import { loadProductData, loadProductParams } from '@/widgets/product-breakdown';

export const alt = 'FA: a deposit product after tax';
export const size = OG_SIZE;
export const contentType = 'image/png';

export async function generateStaticParams() {
  return loadProductParams();
}

// eslint-disable-next-line import-x/no-default-export -- Next file convention needs a default export, T15
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) return ogCard('Product', 'FA');
  const data = await loadProductData(id);
  if (data === null) return ogCard('Product', 'FA');
  return ogCard(data.product.name, data.institution.name);
}
