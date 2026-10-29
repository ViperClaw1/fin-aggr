import type { MetadataRoute } from 'next';

// Name and colors only; the icons arrive with the brand (T10).
// eslint-disable-next-line import-x/no-default-export -- Next file convention needs a default export, T15
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FA · Compare deposits after tax',
    short_name: 'FA',
    description: 'Compare CDs, savings accounts and Treasuries by what you keep after tax.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
  };
}
