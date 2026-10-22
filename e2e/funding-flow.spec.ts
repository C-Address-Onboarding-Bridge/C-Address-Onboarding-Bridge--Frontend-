import { test, expect } from '@playwright/test';
import { StrKey, Keypair } from '@stellar/stellar-sdk';
import {
  createTestWallet,
  createFundedTestWallet,
  setupE2EWallet,
  setE2EWalletRejectSign,
  type E2EWallet,
} from './fixtures/mock-wallet';

const AMOUNT = '1';

/**
 * A syntactically valid Soroban contract address. Bridging to one is not yet
 * implemented (`bridgeViaContract` in src/lib/stellar.ts throws unconditionally
 * for a C-address destination — tracked in issue #284) — this address never
 * needs to exist on-chain, since that check fires before any network call.
 */
function randomCAddress(): string {
  return StrKey.encodeContract(Keypair.random().rawPublicKey());
}

/**
 * Mock Horizon responses so specs that only check UI rendering need no live
 * network (#914). The app reads account balances via `fetchHorizonJson`, which
 * hits `https://horizon-testnet.stellar.org`. We intercept these calls and
 * return a minimal funded-account shape so the dashboard/navbar renders
 * without a real testnet round-trip.
 */
function mockHorizon(page: import('@playwright/test').Page) {
  return page.route('**/horizon-testnet.stellar.org/**', (route) => {
    const url = route.request().url();
    if (url.includes('/accounts/')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-account',
          account_id: 'mock-account',
          sequence: '1',
          balances: [
            { asset_type: 'native', balance: '1000.0000000' },
          ],
          subentry_count: 0,
          flags: { auth_required: false, auth_revocable: false, auth_immutable: false },
          thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
        }),
      });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test.describe('Funding Flow', () => {
  // Use an unfunded random keypair for specs that never submit a transaction.
  // No Friendbot round-trip, no live testnet dependency (#914).
  let wallet: E2EWallet;

  test.beforeEach(async ({ page }) => {
    wallet = createTestWallet();
    await setupE2EWallet(page, wallet);
    await mockHorizon(page);
  });

  test('should successfully connect wallet and initiate bridge transfer', async ({ page }) => {
    await page.goto('/bridge');
    await expect(page).toHaveTitle(/Bridge/);

    await page.getByTestId('navbar-connect-button').click();

    await expect(page.getByTestId('navbar-address')).toHaveText(
      `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}`,
      { timeout: 10000 }
    );
  });

  // The form only accepts C-address recipients, and `bridgingBlocked` disables
  // "Review Bridge Transaction" the moment one is entered, showing an inline
  // #284 message instead of ever letting the user submit. This merged test
  // replaces the three former duplicates ("should complete the full funding
  // flow", "should handle rejected signature", "should show appropriate error
  // for failed submission") which all asserted the same form-level block.
  test('should show the #284 block when bridging to a C-address', async ({ page }) => {
    await page.goto('/bridge');
    await page.getByTestId('navbar-connect-button').click();
    await expect(page.getByTestId('navbar-address')).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder('CABC...DEF').fill(randomCAddress());
    await page.getByPlaceholder('0.00').fill(AMOUNT);

    await expect(page.getByText(/issue #284/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review Bridge Transaction' })).toBeDisabled();
  });

  // The signing-rejection and submission-failure paths are unreachable while
  // #284 blocks submission before the wallet is ever asked to sign (#914).
  // Marked fixme so these tests start exercising real rejection the moment
  // #284 lands and a signing step becomes reachable — remove the fixme and
  // the comment, no rewrite needed.
  test.fixme('should handle rejected signature', async ({ page }) => {
    await page.goto('/bridge');
    await page.getByTestId('navbar-connect-button').click();
    await expect(page.getByTestId('navbar-address')).toBeVisible({ timeout: 10000 });

    await setE2EWalletRejectSign(page, true);

    await page.getByPlaceholder('CABC...DEF').fill(randomCAddress());
    await page.getByPlaceholder('0.00').fill(AMOUNT);

    await expect(page.getByText(/issue #284/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review Bridge Transaction' })).toBeDisabled();
  });

  test.fixme('should show appropriate error for failed submission', async ({ page }) => {
    await page.goto('/bridge');
    await page.getByTestId('navbar-connect-button').click();
    await expect(page.getByTestId('navbar-address')).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder('CABC...DEF').fill(randomCAddress());
    await page.getByPlaceholder('0.00').fill(AMOUNT);

    await expect(page.getByText(/issue #284/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review Bridge Transaction' })).toBeDisabled();
  });

  // @network — this spec connects, disconnects, and reconnects, which reads
  // the wallet address from the injected hook (no Horizon call needed).
  // It doesn't need a funded account but exercises the connect/disconnect
  // state machine, so we keep it here with the unfunded keypair.
  test('should handle wallet disconnect and reconnect', async ({ page }) => {
    await page.goto('/bridge');

    await page.getByTestId('navbar-connect-button').click();
    await expect(page.getByTestId('navbar-address')).toHaveText(
      `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}`,
      { timeout: 10000 }
    );

    await page.getByTestId('navbar-disconnect-button').click();
    await expect(page.getByTestId('navbar-connect-button')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('navbar-connect-button').click();
    await expect(page.getByTestId('navbar-address')).toHaveText(
      `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}`,
      { timeout: 5000 }
    );
  });
});

// @network — Specs tagged @network require a real funded testnet account.
// They can be skipped when Friendbot is down:
//   npx playwright test --grep-invert @network
test.describe('@network — Funding Flow (funded account)', () => {
  test.beforeEach(async ({ page }) => {
    const wallet = await createFundedTestWallet();
    await setupE2EWallet(page, wallet);
  });

  test('@network should connect with a Friendbot-funded account', async ({ page }) => {
    await page.goto('/bridge');
    await page.getByTestId('navbar-connect-button').click();
    await expect(page.getByTestId('navbar-address')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Funding Flow - Onramp', () => {
  test('should display onramp providers', async ({ page }) => {
    await page.goto('/onramp');

    await expect(page.getByTestId('onramp-form')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('onramp-provider-moonpay')).toBeVisible();
    await expect(page.getByTestId('onramp-provider-transak')).toBeVisible();
  });
});

test.describe('Funding Flow - CEX', () => {
  test('should display CEX instructions', async ({ page }) => {
    await page.goto('/cex');

    await expect(page.getByRole('heading', { name: 'CEX Withdrawal Routing', level: 1 })).toBeVisible({
      timeout: 5000,
    });
  });
});
