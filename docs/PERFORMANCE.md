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

The values are from the production build's route HTML and include the shared Next.js runtime plus route-specific scripts. Dynamically rendered parameterized routes do not have standalone prerendered HTML files in this build.

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

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Lighthouse Score | ≥ 90 | ~85 | Tracked in CI |
| Largest Contentful Paint (LCP) | ≤ 2.5s | ~2.1s | Monitored |
| Cumulative Layout Shift (CLS) | ≤ 0.1 | ~0.05 | Monitored |
| First Input Delay (FID) / INP | ≤ 100ms | ~80ms | Monitored |

## Widget Bundle

The external widget bundle (if enabled) has stricter constraints due to being embedded in third-party sites:

- **Target size:** ≤ 50 KB (gzipped)
- **Reason:** Minimal impact on partner sites' load times

Track widget-specific size with:
```bash
npm run analyze -- --widget
```

## Enforcement

- **CI:** Builds fail when initial JS exceeds 700 KB
- **PR Reports:** Bundle analysis appears in pull request comments showing the delta from main
- **Local:** Run `npm run analyze` to see a visual breakdown in `.next/analyze/__bundle_report.html`

## Monitoring

Lighthouse scores and Core Web Vitals are tracked in:
- GitHub Actions CI logs (on every build)
- Vercel Analytics (on deployed previews and production)
- Web Vitals reports (via Service Worker in production)

## Recent optimization history

- **Initial SDK:** Stellar SDK is kept out of initial route JS and loaded from deferred chunks when wallet or network operations need it
- **Bundle analyzer:** Enabled with `npm run analyze` to identify large modules before they land

## Rationale

Bundle size directly impacts first-paint performance and user satisfaction, especially on slower networks. Core Web Vitals targets ensure a good experience across devices and connection speeds.

As new features land (charts, widgets, i18n), keeping budgets in place prevents the gradual weight gain that is only discovered months later when someone measures.
