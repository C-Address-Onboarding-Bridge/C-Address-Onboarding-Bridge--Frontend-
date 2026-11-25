# End-to-End Testing

This document explains the end-to-end tests for the C-Address Bridge (#496), which cover the full funding flow from wallet connection through transaction submission.

## Test Coverage

The E2E tests verify:

1. **Wallet connection:** Connect, disconnect, and reconnect flows
2. **Funding flow (G → C bridge):** The form-level block for C-address recipients (#284)
3. **Funding methods:** Bridge, Onramp, and CEX flows
4. **Wallet state management:** Connect, disconnect, and reconnect flows

> **Note:** Signature rejection and failed-submission tests are marked `test.fixme` until issue #284 makes the signing step reachable.

## Architecture

- **Framework:** [Playwright](https://playwright.dev/)
- **Mock wallet:** `e2e/fixtures/mock-wallet.ts` — injects `window.__E2E_WALLET__` via `page.addInitScript` so the app uses a test keypair instead of calling the real Stellar Wallets Kit
- **Live testnet dependency:** Tests fund a real, disposable testnet account through Stellar's public [Friendbot](https://friendbot.stellar.org) faucet and make real Horizon calls (sequence number, fee stats). There is no API mocking layer — specs that need a network response call testnet Horizon directly, and specs that never submit use an unfunded random keypair to avoid the Friendbot round-trip.
- **Non-deterministic:** Tests depend on live testnet (Friendbot + Horizon) availability. CI can fail when testnet is slow, rate-limited, or reset.

## Running tests locally

### Start the dev server (if not running)

```bash
npm run dev
```

### Run all tests

```bash
npm run test:e2e
```

### Run tests in headed mode (see browser window)

```bash
npm run test:e2e:headed
```

### Debug a specific test

```bash
npm run test:e2e:debug -- funding-flow.spec.ts
```

### Run only the chromium project (fastest, no external browser downloads)

```bash
npx playwright test --project=chromium
```

## Writing new tests

1. Create a new test file in `e2e/` with `.spec.ts` extension
2. Import `createFundedTestWallet`, `setupE2EWallet`, and `E2EWallet` from `./fixtures/mock-wallet`
3. Inject the wallet hook before navigating:

```typescript
import { test, expect } from '@playwright/test';
import { createFundedTestWallet, setupE2EWallet, type E2EWallet } from './fixtures/mock-wallet';

test('my test', async ({ page }) => {
  // Fund a disposable testnet keypair through Friendbot
  const wallet: E2EWallet = await createFundedTestWallet();
  // Inject the hook so the app uses this keypair instead of the real wallet kit
  await setupE2EWallet(page, wallet);

  await page.goto('/bridge');
  await expect(page).toHaveTitle(/Bridge/);
});
```

> **Tip:** If your test never submits a transaction, skip the Friendbot call and
> use an unfunded random keypair instead — see `createTestWallet` in
> `e2e/fixtures/mock-wallet.ts`. This avoids a live-network dependency for
> specs that only check UI rendering.

## Mocking API responses

Specs do not currently use `page.route()` to mock network responses. If you
need to intercept a request (for example to simulate a Horizon error), use
Playwright's [page.route()](https://playwright.dev/docs/api/class-page#page-route)
API:

```typescript
await page.route('**/health', route => {
  route.fulfill({
    status: 200,
    body: JSON.stringify({ status: 'ok' })
  });
});
```

## Test files

| File | Purpose |
|------|---------|
| `e2e/fixtures/mock-wallet.ts` | Test wallet helpers (create funded/unfunded keypairs, inject `__E2E_WALLET__` hook) |
| `e2e/funding-flow.spec.ts` | Funding flow tests (connect, disconnect, #284 block, onramp, CEX) |
| `playwright.config.ts` | Playwright configuration and test setup |

## Debugging failed tests

Playwright automatically captures:
- **Screenshots** for failed tests (in `test-results/`)
- **Videos** for failed tests (in `test-results/`)
- **Trace files** for debugging (in `test-results/`)

To view traces after a failure:

```bash
npx playwright show-trace test-results/trace.zip
```

## CI Integration

The tests run on every pull request and main branch push. If any test fails, the build is marked as failed.

The E2E job is blocking — when Friendbot or testnet Horizon is slow, rate-limited,
or reset, the job fails even though the app code is correct. A tagged `@network`
spec that requires a funded account can be skipped by filtering:

```bash
# Run only specs that don't need Friendbot
npx playwright test --grep-invert @network

# Run only the network-dependent spec
npx playwright test --grep @network
```

## Known limitations

- Tests cannot interact with actual wallet extensions (we use a mock keypair injected via `window.__E2E_WALLET__`)
- Tests run against a local dev server, not production
- Tests that fund through Friendbot depend on live testnet availability
- Geolocation and payment provider redirects are not tested (can be added if needed)

## Troubleshooting

**Tests hang or timeout:**
- Ensure `npm run dev` is running and accessible at http://localhost:3000
- Check that no other process is using port 3000
- If Friendbot is slow, run only chromium: `npx playwright test --project=chromium`

**Mock wallet not available:**
- Verify `setupE2EWallet` is called before `page.goto(...)`
- Check browser console for errors: `page.on('console', msg => console.log(msg))`

**Flaky tests:**
- Use `expect(...).toBeVisible({ timeout: 5000 })` for UI elements that may take time to render
- If the flakiness is from testnet, run with `--grep-invert @network` to skip funded-account tests

