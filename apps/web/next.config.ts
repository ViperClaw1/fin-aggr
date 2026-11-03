import type { NextConfig } from 'next';
import { securityHeaders } from './security-headers';

const nextConfig: NextConfig = {
  // Production only (Next 16.4). Tailwind stays small, so the first visit does not wait on a CSS file.
  experimental: { inlineCss: true },
  headers: () =>
    Promise.resolve([
      { source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'development') },
    ]),
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ['@fa/contracts', '@fa/engine', '@fa/fixtures'],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
