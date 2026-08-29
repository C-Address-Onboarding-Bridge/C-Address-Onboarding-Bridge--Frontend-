# SEO and Social Metadata

This document describes the SEO and social metadata implementation (#497) for the C-Address Bridge.

## Metadata Structure

Each page includes:

1. **Page-specific metadata** — unique titles, descriptions, OG tags
2. **Structured data** — JSON-LD schema for search engines
3. **Social cards** — Twitter Card and Open Graph for link previews
4. **Indexing rules** — explicit inclusion/exclusion for search engines

## Page Metadata

### Root Layout (`src/app/layout.tsx`)

- **Title:** "C-Address Bridge | Soroban Onboarding Protocol"
- **Description:** Fund Soroban smart accounts from any source
- **Type:** WebApplication
- **Image:** 1200x630 OG image
- **Robots:** index, follow

### Public Pages

Each public page has a dedicated layout with metadata:

| Page | Path | Indexable | Purpose |
|------|------|-----------|---------|
| Landing | `/` | Yes | Homepage, highest priority |
| Bridge | `/bridge` | Yes | Primary funding method |
| Onramp | `/onramp` | Yes | Fiat funding method |
| CEX | `/cex` | Yes | Exchange withdrawal method |
| Profile | `/profile` | No | User-specific content |
| Dashboard | `/dashboard` | No | User-specific content |

### User-Specific Pages

Pages like `/profile` and `/dashboard` have `robots: { index: false }` to prevent indexing of user-specific content.

## Structured Data

The root layout includes a JSON-LD script for the WebApplication schema:

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "C-Address Bridge",
  "description": "Fund any Soroban smart account...",
  "url": "https://c-address-bridge.example.com",
  "applicationCategory": "FinanceApplication",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "XLM",
    "price": "0"
  }
}
```

## Sitemap

The sitemap is automatically generated from the app routes:

```
GET /sitemap.xml
```

Lists all public pages with:
- Last modified date
- Change frequency (weekly for public pages)
- Priority (1.0 for homepage, 0.8–0.9 for others)

## Robots.txt

The robots file controls crawler access:

```
GET /robots.txt
```

Configuration:
- Allow all public routes: `/`, `/bridge`, `/onramp`, `/cex`
- Disallow user pages: `/profile`, `/dashboard`
- Disallow internal: `/_next/`, `/api/`
- Link to sitemap

## Open Graph and Twitter Cards

Each page includes:

- **og:title** — page title
- **og:description** — page description
- **og:url** — canonical URL
- **og:type** — "website"
- **og:image** — 1200x630 preview image
- **twitter:card** — "summary_large_image"
- **twitter:title** — concise title
- **twitter:description** — social-friendly description
- **twitter:image** — preview image

## Implementation Details

### Layout Files

Each route has a `layout.tsx` that exports metadata:

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page Title | C-Address Bridge',
  description: 'Page description for search results.',
  openGraph: {
    title: 'Page Title',
    description: 'Social card description.',
    url: 'https://c-address-bridge.example.com/path',
    type: 'website',
    images: [{...}],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Page Title',
    description: 'Twitter description.',
    images: ['...'],
  },
  robots: {
    index: true,
    follow: true,
  },
};
```

### Automatic Generation

- **Sitemap:** Generated from Next.js route structure
- **Robots.txt:** Generated from Next.js route structure
- **Canonical URLs:** Set to HTTPS production URL
- **Alternate tags:** Included for multi-language support (future)

## Validation

To validate metadata:

1. **Google Search Console:** Submit sitemap, check indexing status
2. **Open Graph Debugger:** Test OG tags at https://developers.facebook.com/tools/debug
3. **Twitter Card Validator:** Test at https://cards-dev.twitter.com/validator
4. **Schema.org Validator:** Validate JSON-LD at https://schema.org/validator
5. **Lighthouse:** Run `npm run build` and check SEO score

## Environment Configuration

The base URL is configurable via environment variable:

```bash
NEXT_PUBLIC_BASE_URL=https://production-domain.com npm run build
```

Default: `https://c-address-bridge.example.com`

This is used in:
- Open Graph URLs
- Twitter Card URLs
- Sitemap entries
- Canonical tags

## Updating Metadata

To update metadata for a page:

1. Find or create `src/app/[route]/layout.tsx`
2. Export a `metadata` object with updated fields
3. Commit and deploy
4. Resubmit sitemap to search engines (if needed)
5. Wait 24–48 hours for search engines to recrawl

## Known Limitations

- Image previews require a real image file at a public URL
- Hreflang tags for multi-language SEO are not yet implemented (see #497)
- Dynamic metadata (from page content) requires `generateMetadata` function (see Next.js docs)
- Rich snippets (breadcrumbs, reviews) not yet implemented

