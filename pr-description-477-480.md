# feat: notification centre, simulation preview, dashboard analytics, network switcher

## Summary

This PR closes four Stellar Wave issues that together make the app's feedback durable and its risky actions explicit: a notification centre that keeps transaction outcomes after the moment passes, a simulation preview before signing, analytics charts on the dashboard, and a persistent network indicator with a switcher.

Note: the repo was in a "learning exercise" state where several lib/hook functions shipped as throwing stubs. The files these issues point at (`src/lib/session.ts`, `src/lib/stellar.ts`) and the flows they exercise depend on that substrate, so each commit restores the implementations its issue needs (session, stellar, sequenceManager, useDebounce, useCopyToClipboard) alongside the new feature. No unrelated stubbed modules were touched.

---

## Changes

### #477 — Notification centre for transaction and account events

- **`src/lib/session.ts`** — restored the wallet-session persistence functions; the notification store mirrors these storage conventions.
- **`src/lib/notifications.ts`** (new) — SSR-safe, corrupt-tolerant localStorage store: `addNotification`, mark read / mark all read, dismiss / clear all, unread counts, a capped list (`MAX_NOTIFICATIONS`), and kinds for transaction outcomes, claimable locks, schedule executions, and failures.
- **`src/components/notification-centre.tsx`** (new) — navbar bell with an unread-count badge and a panel listing events (newest first) with deep links, per-item dismiss, "Mark all read", "Clear all", and Escape-to-close.
- **`src/components/navbar.tsx`** — bell wired into the header.
- **`src/app/bridge/page.tsx`** — records transaction outcomes: success deep-links to the transaction on stellar.expert, failures deep-link back to `/bridge`.
- Tests: persistence across reloads, unread counts, corrupt stored state (including malformed entries), and centre interactions.

### #478 — Transaction preview with simulation results before signing

- **`src/lib/stellar.ts`** — restored the transaction/network substrate and added `simulatePayment` (pure prediction: invalid destination, invalid amount, insufficient balance, missing trustline, unfunded source) plus `simulateBridgeTransaction`.
- **`src/app/api/simulate/route.ts`** (new) — `POST /api/simulate` runs the prediction server-side against live Horizon state and always resolves with a `SimulationResult`.
- **`src/app/bridge/page.tsx`** — calls the simulation endpoint before presenting the signing step; the review screen shows the predicted fee, net amount, and recipient with an explicit "this is a prediction" note, surfaces the specific failure reason, re-simulates whenever the user returns to review after editing, and blocks "Confirm & Sign" when the simulation predicts failure (degrading to the static review screen only if the endpoint is unreachable).
- **`src/lib/sequenceManager.ts` / `src/hooks/useDebounce.ts`** — restored implementations the flow depends on.
- Tests covering each predicted failure reason and the successful preview math.

### #479 — Analytics charts on the dashboard

- **`src/components/routes/dashboard-page.tsx`** — added an Analytics section with volume-over-time and transaction-count charts over a selectable 7/30/90-day range, a volume-by-asset breakdown, and an explicit empty state.
- Charts are lightweight SVG bars coloured via CSS variables so they stay readable in light and dark themes.
- Screen reader users get a full data table (daily date / volume / count) as the accessible alternative.
- **`src/hooks/useCopyToClipboard.ts`** — restored implementation the dashboard depends on.
- Tests covering the empty state, range switching, aggregation (zero-filled days, per-asset volume, out-of-range filtering), and the accessible table.

### #480 — Network switcher with clear testnet indication

- **`src/lib/stellar.ts`** — added `switchWalletNetwork`: requests the change through the wallet (`window.freighter.setNetwork` when the extension exposes it), polls until the wallet confirms, and falls back to a "switch manually in Freighter" hint when no programmatic API exists. Also added `shouldWarnOnMainnetAction`.
- **`src/components/wallet-provider.tsx`** — tracks `networkChangedAt` / `recentlyChangedNetwork` and exposes `switchNetwork`, re-reading wallet state after a switch.
- **`src/components/navbar.tsx`** — always-visible network indicator (Mainnet green, Testnet yellow, unsupported networks named in red, Unknown grey) with a switcher menu offering Testnet/Mainnet, plus a compact switcher in the mobile menu.
- **`src/app/bridge/page.tsx`** — a mainnet action initiated shortly after a network change is blocked behind a clear "real funds on Mainnet" warning until the user acknowledges.
- Tests covering each network state, the switcher outcomes (switched / cancelled / manual), and the mainnet-warning gate.

---

## CI status

Run locally against this branch:

| Check | Status |
|---|---|
| `npm run lint` | ✅ Passes (0 errors) |
| `npm run typecheck` | ⚠️ Only the 3 pre-existing errors in `src/lib/__tests__/featureFlags.test.ts` (present on `main` before this PR) |
| `npm run test` | ⚠️ 13 files still failing — all pre-existing (avatar/profile/i18n/errors/serviceWorker/performance stubs and two stale tests that also fail at the pre-stub commit). **Zero regressions**; 16 previously-failing files now pass, and all tests added for these four issues pass |
| `npm run build` | ✅ Passes, incl. `ENFORCE_BUDGET=true` |

## Files changed

```
src/lib/session.ts
src/lib/notifications.ts                (new)
src/lib/stellar.ts
src/lib/sequenceManager.ts
src/hooks/useDebounce.ts
src/hooks/useCopyToClipboard.ts
src/components/notification-centre.tsx  (new)
src/components/navbar.tsx
src/components/wallet-provider.tsx
src/components/routes/dashboard-page.tsx
src/app/bridge/page.tsx
src/app/api/simulate/route.ts           (new)
src/lib/__tests__/notifications.test.ts (new)
src/components/__tests__/notification-centre.test.tsx (new)
src/lib/__tests__/simulate.test.ts      (new)
src/__tests__/analytics.test.tsx        (new)
src/__tests__/switchWalletNetwork.test.ts (new)
src/__tests__/navbar-network-indicator.test.tsx (new)
src/__tests__/bridge-mainnet-warning.test.ts (new)
```

---

Closes #477
Closes #478
Closes #479
Closes #480
