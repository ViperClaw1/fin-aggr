import type { NextConfig } from 'next';
import { securityHeaders } from './security-headers';

const nextConfig: NextConfig = {
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
