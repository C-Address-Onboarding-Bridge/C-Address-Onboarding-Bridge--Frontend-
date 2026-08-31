# End-to-End Testing

This document explains the end-to-end tests for the C-Address Bridge (#496), which cover the full funding flow from wallet connection through transaction submission.

## Test Coverage

The E2E tests verify:

1. **Happy path:** Connect wallet → Enter recipient → Review → Sign → Success
2. **Signature rejection:** User denies signing a transaction
3. **Failed submission:** API errors or network failures
4. **Wallet state management:** Connect, disconnect, and reconnect flows
5. **Funding methods:** Bridge, Onramp, and CEX flows

## Architecture

- **Framework:** [Playwright](https://playwright.dev/)
- **Mock wallet:** `e2e/fixtures/mock-wallet.ts` — simulates the @stellar/freighter-api without requiring actual wallet software
- **Mock API:** Tests route network requests to simulate API success and failure scenarios
- **Deterministic:** No dependencies on live APIs or real wallet extensions

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

### Run a single test

```bash
npx playwright test funding-flow.spec.ts -g "should successfully connect wallet"
```

## Test files

| File | Purpose |
|------|---------|
| `e2e/fixtures/mock-wallet.ts` | Mock Freighter wallet provider for testing |
| `e2e/funding-flow.spec.ts` | Full funding flow tests across all methods |
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

To skip the E2E tests locally:

```bash
CI=false npm run test:e2e
```

(This is not recommended except for debugging specific unit tests.)

## Writing new tests

1. Create a new test file in `e2e/` with `.spec.ts` extension
2. Import `setupMockWallet` from `./fixtures/mock-wallet`
3. Use Playwright's test API:

```typescript
import { test, expect } from '@playwright/test';
import { setupMockWallet, connectMockWallet } from './fixtures/mock-wallet';

test('my test', async ({ page }) => {
  await setupMockWallet(page);
  await page.goto('/bridge');
  await expect(page).toHaveTitle('Bridge');
});
```

## Mocking API responses

Use `page.route()` to mock API endpoints:

```typescript
await page.route('**/api/submit-transaction', route => {
  route.abort('failed'); // Simulate network error
});

// Or return a custom response:
await page.route('**/api/health', route => {
  route.fulfill({
    status: 200,
    body: JSON.stringify({ status: 'degraded' })
  });
});
```

## Known limitations

- Tests cannot interact with actual wallet extensions (we use a mock)
- Tests run against a local dev server, not production
- Geolocation and payment provider redirects are not tested (can be added if needed)

## Troubleshooting

**Tests hang or timeout:**
- Ensure `npm run dev` is running and accessible at http://localhost:3000
- Check that no other process is using port 3000

**Mock wallet not available:**
- Verify `setupMockWallet` is called in test setup
- Check browser console for errors: `page.on('console', msg => console.log(msg))`

**Flaky tests:**
- Add explicit waits: `await page.waitForTimeout(500)` before sensitive operations
- Use `expect(...).toBeVisible({ timeout: 5000 })` for UI elements that may take time to render

