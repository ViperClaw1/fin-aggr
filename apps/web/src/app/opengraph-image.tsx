import { OG_SIZE, ogCard } from './og-card';

export const alt = 'FA: compare deposits by what you keep after tax';
export const size = OG_SIZE;
export const contentType = 'image/png';

// eslint-disable-next-line import-x/no-default-export -- Next file convention needs a default export, T15
export default function Image() {
  return ogCard('Compare deposits after tax', 'CDs, savings accounts and Treasuries');
}
