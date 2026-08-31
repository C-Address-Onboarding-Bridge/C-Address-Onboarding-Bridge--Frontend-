import type { MetadataRoute } from 'next';

/**
 * Sitemap for SEO (#497).
 *
 * Lists all public pages that should be discoverable by search engines.
 * User-specific pages (profile, dashboard) are excluded.
 */

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://c-address-bridge.example.com',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://c-address-bridge.example.com/bridge',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://c-address-bridge.example.com/onramp',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://c-address-bridge.example.com/cex',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];
}
