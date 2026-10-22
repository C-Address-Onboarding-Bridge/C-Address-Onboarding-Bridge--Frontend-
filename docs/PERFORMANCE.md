# Performance Budgets

This document defines the performance budgets for the C-Address Bridge application and explains the rationale behind each target.

## Bundle Size Budget

**Initial JavaScript: 700 KB**

The initial JS budget is a ratchet just above the current maximum single-route size. Route sizes below are the uncompressed JavaScript referenced by each route's production HTML after moving SDK and wallet-kit imports behind asynchronous operations. The Stellar SDK remains in a deferred ~957 KB chunk and is not part of first-render route JavaScript.

| Route | Initial JS |
|---|---:|
| `/` | 643.62 KB |
| `/address-book` | 638.79 KB |
| `/bridge` | 672.75 KB |
| `/cex` | 634.89 KB |
| `/dashboard` | 675.17 KB |
| `/onramp` | 644.83 KB |
| `/profile` | 645.03 KB |
| `/referrals` | 661.19 KB |
| `/schedules` | 648.51 KB |
| `/widget` | 629.20 KB |

> **How these numbers were produced:** run `npm run build` locally and inspect
> the HTML files under `.next/server/app/`. Each HTML file references a set of
> `<script>` tags; summing the sizes of those scripts (excluding the deferred
> SDK chunk) gives the per-route initial JS figure. These are point-in-time
> snapshots — they will drift as the codebase changes and are **not** re-checked
> automatically in CI.

### What the webpack budget actually measures

The webpack `performance` block in `next.config.ts` checks two things:

- **`maxEntrypointSize`** — the total size of all assets that are part of a
  webpack *entrypoint* (the shared runtime + the route chunk). This is a
  webpack concept and does not map 1-to-1 to the per-route HTML totals in the
  table above.
- **`maxAssetSize`** — a per-file ceiling, set to `Math.max(1 MB, budget)` so
  that the large deferred Stellar SDK chunk does not trip the budget that is
  intended for first-render route JS.

When a budget is exceeded the build prints:
```
ERROR in asset size limit: The following asset(s) exceed the specified limit...
```
This only happens when `ENFORCE_BUDGET=true` is set (CI sets this; local builds
default to a warning).

### How to adjust the budget

1. **Temporarily override for a specific build:**
   ```bash
   NEXT_PUBLIC_INITIAL_JS_BUDGET_KB=700 npm run build
   ```

2. **Permanently raise the budget** (in `next.config.ts`):
   ```typescript
   const initialJsBudgetBytes =
     Number(process.env.NEXT_PUBLIC_INITIAL_JS_BUDGET_KB ?? "700") * 1024;
   ```
   Only do this after optimizing the code and confirming the larger bundle is necessary.

3. **Lower the budget** (encouraged as dependencies shrink):
   - Update the default value in `next.config.ts`
   - Document the optimization work in the commit message

## Core Web Vitals Targets

These targets align with Google's recommended thresholds for "good" user experience:

| Metric | Target | Notes |
|--------|--------|-------|
| Largest Contentful Paint (LCP) | ≤ 2.5s | Not automatically measured in CI |
| Cumulative Layout Shift (CLS) | ≤ 0.1 | Not automatically measured in CI |
| First Input Delay (FID) / INP | ≤ 100ms | Not automatically measured in CI |

> **Note:** CI does not run Lighthouse or any automated Core Web Vitals
> measurement. The numbers are targets for manual measurement with browser
> DevTools, PageSpeed Insights, or a local Lighthouse run — not enforced
> thresholds. A CI Lighthouse step is not configured in
> `.github/workflows/ci.yml`.

## Widget Bundle

The external widget bundle (if enabled) has stricter constraints due to being embedded in third-party sites:

- **Target size:** ≤ 50 KB (gzipped)
- **Reason:** Minimal impact on partner sites' load times

The widget bundle size is not tracked separately by an automated tool. Inspect
`.next/` after a production build to check widget chunk sizes manually.

## Enforcement

- **CI build budget:** When `ENFORCE_BUDGET=true` (set by CI), webpack emits
  an error and the build fails if the webpack entrypoint or any asset exceeds
  the configured limit. This is the only automated enforcement in place.
- **Local analysis:** Run `npm run analyze` to open a visual bundle breakdown
  in `.next/analyze/__bundle_report.html` (powered by `@next/bundle-analyzer`).

> **Not implemented:** Bundle-size delta comments on pull requests are not
> posted automatically. No CI step runs Lighthouse or posts Lighthouse scores.

## Monitoring

Core Web Vitals and Lighthouse scores are **not** collected automatically.
Vercel Analytics can be enabled on a Vercel deployment to collect real-user
Web Vitals; this is not configured in the repository. `public/sw.js` is a
caching service worker only — it does not report performance metrics.

For manual measurement, use:
- Chrome DevTools → Lighthouse panel
- [PageSpeed Insights](https://pagespeed.web.dev/)
- `npm run analyze` for bundle composition

## Recent optimization history

- **Initial SDK:** Stellar SDK is kept out of initial route JS and loaded from deferred chunks when wallet or network operations need it
- **Bundle analyzer:** Enabled with `npm run analyze` to identify large modules before they land

## Rationale

Bundle size directly impacts first-paint performance and user satisfaction, especially on slower networks. Core Web Vitals targets ensure a good experience across devices and connection speeds.

As new features land (charts, widgets, i18n), keeping budgets in place prevents the gradual weight gain that is only discovered months later when someone measures.
