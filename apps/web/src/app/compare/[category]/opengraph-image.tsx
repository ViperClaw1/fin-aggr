import { STAGE1_CATEGORIES } from '@fa/contracts';
import { OG_SIZE, ogCard } from '../../og-card';
import { DESCRIPTION, isStage1, TITLE } from './category-texts';

export const alt = 'FA: a deposit comparison by after-tax yield';
export const size = OG_SIZE;
export const contentType = 'image/png';

// built with the pages, one image per category
export function generateStaticParams() {
  return STAGE1_CATEGORIES.map((category) => ({ category }));
}

// eslint-disable-next-line import-x/no-default-export -- Next file convention needs a default export, T15
export default async function Image({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!isStage1(category)) return ogCard('Compare deposits after tax', 'FA');
  return ogCard(TITLE[category], DESCRIPTION[category]);
}
