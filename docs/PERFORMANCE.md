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

These values were captured from the production build's route HTML and include the shared Next.js runtime plus route-specific scripts. Dynamically rendered parameterized routes do not have standalone prerendered HTML files in this build.

> **What the budget actually measures:** The webpack `maxAssetSize` and `maxEntrypointSize` limits in `next.config.ts` apply to webpack asset/entrypoint sizes, not to the per-route HTML totals in the table above. The per-route numbers in the table are measured manually from the production build output HTML (`next build` then inspect `.next/server/app/`). To reproduce the table, run `npm run build` and check the file sizes reported in the build output, or inspect the generated HTML files in `.next/server/app/` to sum the script sizes for each route.

When bundle size increases, the build fails with `ERROR in asset size limit: The following asset(s) exceed the specified limit...` This prompts engineers to investigate and optimize before merge.

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
| Largest Contentful Paint (LCP) | ≤ 2.5s | Not currently tracked automatically |
| Cumulative Layout Shift (CLS) | ≤ 0.1 | Not currently tracked automatically |
| First Input Delay (FID) / INP | ≤ 100ms | Not currently tracked automatically |

> **Note:** CWV are not currently measured or enforced in CI. The values previously shown in this table had no documented source and have been removed. Measure against real user traffic (e.g. Vercel Analytics, Lighthouse DevTools) to track progress toward these targets.

## Widget Bundle

The external widget bundle (if enabled) has stricter constraints due to being embedded in third-party sites:

- **Target size:** ≤ 50 KB (gzipped)
- **Reason:** Minimal impact on partner sites' load times

To check widget-specific size, run `npm run analyze` (which runs `ANALYZE=true next build`) and inspect the bundle report. There is no `--widget` flag — the analyzer reports all chunks including the widget entry point.

## Enforcement

- **Build budget:** The webpack `maxAssetSize`/`maxEntrypointSize` limits in `next.config.ts` cause the build to fail when asset or entrypoint sizes exceed the configured threshold. Run `npm run build` to check.
- **Local analysis:** Run `npm run analyze` to see a visual breakdown in `.next/analyze/__bundle_report.html`.

> **Not implemented:** Lighthouse CI, automated PR bundle-delta comments, and Web Vitals reporting via the service worker are **not** currently configured. `public/sw.js` handles asset caching only. `.github/workflows/ci.yml` runs lint, typecheck, tests, and build — it posts no Lighthouse results and no PR comments. These features can be added in future issues.

## Monitoring

Performance monitoring beyond the local build budget is currently manual:

- Run `npm run build` locally to verify bundle sizes stay under budget.
- Use browser DevTools Lighthouse panel or [web.dev/measure](https://web.dev/measure) to check Core Web Vitals against the targets above.
- Vercel Analytics (if configured on a deployment) can track real-user CWV over time.

## Recent optimization history

- **Initial SDK:** Stellar SDK is kept out of initial route JS and loaded from deferred chunks when wallet or network operations need it.
- **Bundle analyzer:** Enabled with `npm run analyze` to identify large modules before they land.

## Rationale

Bundle size directly impacts first-paint performance and user satisfaction, especially on slower networks. Core Web Vitals targets ensure a good experience across devices and connection speeds.

As new features land (charts, widgets, i18n), keeping budgets in place prevents the gradual weight gain that is only discovered months later when someone measures.
