# Caching & Client Storage

This document is the map of every cache and every piece of persisted state in the frontend: what is cached, how long for, what invalidates it, and the rules for adding a new one. It exists because the app has no backend — all caching is in-process (a `Map` in a module) or in the browser (`localStorage`), and both are easy to get subtly wrong.

Related: [Sequence Number Caching](sequence-numbers.md) covers the sequence-number cache's correctness invariant in depth.

## At a glance

| Cache / store | Location | Scope & key | Lifetime | Invalidated by |
|---|---|---|---|---|
| Account balances | `src/lib/stellar.ts` | Module `Map`, key `address:network` | 10 s TTL | TTL expiry, failed fetch (evicted), `clearAccountBalancesCache()` |
| Account sequence numbers | `src/lib/sequenceManager.ts` | Module `Map`, key `network:accountId` | 30 s TTL | TTL expiry, `invalidateSequenceCache()`, `clearAllSequenceCache()`, `tx_bad_seq` retry |
| Transaction list identity | `src/components/routes/dashboard-page.tsx` | React state, per mount | Component lifetime | A poll tick whose `id`/`status` set differs |
| Wallet session | `src/lib/session.ts` | `localStorage`, key `wallet:session` | 12 h TTL | Explicit connect, `clearSession()`, TTL lapse |
| Avatar image | `src/lib/avatar.ts` | `localStorage`, key `avatar:<address>` | Until removed | "Remove" button, clearing site data |
| Feature-flag dev overrides | `src/lib/featureFlags.ts` | `localStorage`, key `ff_dev_overrides` | Until cleared | Dev panel reset |
| Static assets / RSC payloads | Next.js | Per build | Build hash | Redeploy |

## Network caches (in-process)

### Account balances — 10 s, promise-level

`getAccountBalances(address, network)` in `src/lib/stellar.ts` is called from two places that often run seconds apart: the Bridge page's "Use connected wallet" check, and the Dashboard on mount plus every 30 s poll tick. Without a shared cache, navigating between those pages issues a fresh Horizon round-trip for data that was just fetched.

Three properties are load-bearing:

1. **The entry stores the in-flight promise, not the resolved value.** Concurrent callers inside the window share a single Horizon request instead of racing to start their own.
2. **Failures are evicted.** `getAccountBalances` never rejects — it falls back to `{ total: "0", balances: [] }` (or `unfunded: true` on a 404). Caching that fallback would pin a bogus zero balance for the whole TTL, so the entry is deleted in a `.catch()` and the next call retries the network.
3. **The TTL is shorter than the Dashboard poll interval** (10 s vs 30 s). This is what keeps the poll meaningful: every tick misses the cache and fetches fresh data. **If you shorten `DASHBOARD_POLL_INTERVAL_MS` below `BALANCE_CACHE_TTL_MS`, the poll silently starts serving cached data.** Keep that ordering.

The key includes the network because the same address exists independently on testnet and mainnet.

### Sequence numbers — 30 s, incremented in place

`getNextSequenceNumber` caches the next unused sequence per `network:accountId` and increments it locally for consecutive transactions rather than re-reading the chain. It is the one cache in the codebase where a stale hit causes a *failed transaction* (`tx_bad_seq`) rather than stale pixels, so it has its own document and its own regression suites — read [sequence-numbers.md](sequence-numbers.md) before touching it.

Two rules from that document are worth repeating here:

- The key must include the network. Keying on the address alone let a Freighter network switch inside the TTL serve the other chain's sequence (#290).
- `withSequenceRetry` invalidates the entry between attempts, so a `bad_seq` recovers on the next try instead of looping on the same bad value.

## Render-level memoisation

The Dashboard's 30 s poll re-fetches transactions on every tick, but the underlying Horizon records are immutable — the only meaningful changes are which transactions exist and their status. `areTransactionsEqual` compares `id` and `status` pairwise and, when nothing changed, `setTransactions` is called with the **previous array reference**. React then bails out of re-rendering the memoised `<TransactionHistory>`.

This is a cache in the sense that matters for performance: the payload is refreshed, the reference is not. If you add a field to `BridgeTransactionData` that can change after a transaction is first seen, add it to `areTransactionsEqual` or the UI will keep showing the old value.

## Browser storage

All persisted state is namespaced with a `<domain>:` prefix (except the pre-existing `ff_dev_overrides` key) and lives behind a small module rather than direct `localStorage` calls at the point of use. Every one of those modules follows the same three rules:

1. **SSR-safe.** `typeof window === "undefined"` returns a default; the `window.localStorage` access is itself wrapped in `try/catch` because it throws outright in some privacy modes.
2. **Never read during render.** Components read storage in an effect after mount (see `AvatarUpload`) or lazily on first use behind a ref (see `WalletProvider`). Reading it during render makes server and client output differ and breaks hydration — the same class of bug as #291.
3. **Treat stored values as untrusted input.** `localStorage` is user-writable and survives across deploys, so values are re-validated on read: a corrupt wallet session falls back to a clean one, and an avatar that is not a `data:image/...;base64,...` URL is discarded rather than handed to an `<img src>`. The app's CSP (`img-src 'self' data:`) is the second layer of that defence.

### `wallet:session` — 12 h

Holds the answer to "did the user press Disconnect?", plus the address it applied to and a write timestamp. The connection poller runs every 3–10 s and would otherwise re-adopt the wallet from Freighter immediately after a reload, silently undoing the disconnect (#288 fixed this in memory; #343 made it survive reloads).

The record lapses after `SESSION_TTL_MS` so a disconnect from days ago does not suppress the wallet forever, and a record stamped in the future — a clock change or hand-edited storage — is treated as expired. `WalletProvider` hydrates the flag **once**, on the first poll, and reads a ref afterwards, so the poll itself does no storage work.

### `avatar:<address>` — until removed

The avatar is a base64 data URL, capped at 512 KB before encoding (`AVATAR_MAX_BYTES`). It is keyed per address so connecting a different account shows that account's own image. Nothing is uploaded anywhere; clearing site data removes it. Keep the cap small: the encoded string is ~33% larger than the file and the ~5 MB origin quota is shared with the session and feature-flag keys. `saveAvatar` returns `false` on a quota failure so the UI can say so instead of losing the image silently.

### `ff_dev_overrides`

Developer-only flag overrides, read in `development` builds only and ahead of both the env-var override and the rollout bucket. See `src/lib/featureFlags.ts`.

## HTTP & framework caching

The app sets no `Cache-Control` headers of its own — `next.config.ts` only adds security headers (CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`). Static assets and RSC payloads are cached by Next.js under the build hash and are invalidated by a redeploy.

Horizon and Soroban RPC responses are **not** HTTP-cached; the only layer in front of them is the in-process caches above. If you add a fetch to a new origin, remember it must also be added to the CSP `connect-src` list.

## Adding a new cache

1. **Put the network in the key** if the value can differ between testnet and mainnet.
2. **Pick a TTL shorter than the fastest consumer's refresh interval**, and write down why in a comment next to the constant.
3. **Do not cache failures or fallback values.** Evict on rejection so the next call retries.
4. **Export a `clear…Cache()` function.** Tests need to reset module-level state between cases; module `Map`s persist for the lifetime of the module.
5. **Reset it in `beforeEach`** in any suite that exercises it, or a passing test will leak into the next one.

## Verifying cache behaviour

```bash
# Balance cache: TTL hit, per-key isolation, failure eviction
npm test -- src/__tests__/stellar.test.ts

# Sequence cache: increments, TTL expiry, invalidation, bad_seq retry
npm test -- src/__tests__/sequenceManager.test.ts src/__tests__/stellar-sequence-integration.test.ts

# Browser storage: session TTL/corruption, avatar validation and per-address keys
npm test -- src/__tests__/session.test.ts src/__tests__/avatar.test.ts

# Poll behaviour while the tab is hidden
npm test -- src/__tests__/pollingVisibility.test.ts
```
