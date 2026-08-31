import type { MetadataRoute } from 'next';

/**
 * Robots.txt for SEO (#497).
 *
 * Controls which pages search engines can crawl and index.
 * User-specific pages and admin areas are disallowed.
 */

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/profile', '/dashboard', '/admin', '/_next/', '/api/'],
    },
    sitemap: 'https://c-address-bridge.example.com/sitemap.xml',
  };
}
