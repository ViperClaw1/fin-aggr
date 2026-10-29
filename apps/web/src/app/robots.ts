import type { MetadataRoute } from 'next';

// No crawling while the data is synthetic (decided 2026-10-29); pages also carry noindex. With real
// data: allow, and add a sitemap.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
