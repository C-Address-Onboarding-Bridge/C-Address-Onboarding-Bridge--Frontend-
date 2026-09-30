import { test, expect } from '@playwright/test';
import { StrKey, Keypair } from '@stellar/stellar-sdk';
import {
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

test.describe('Funding Flow', () => {
  // A fresh, Friendbot-funded testnet keypair per test — sharing one sender
  // across tests would race on its sequence number once Playwright runs them
  // in parallel (fullyParallel: true in playwright.config.ts).
  let wallet: E2EWallet;

  test.beforeEach(async ({ page }) => {
    wallet = await createFundedTestWallet();
    await setupE2EWallet(page, wallet);
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

  // The form itself only accepts C-address recipients (see `validTo` in
  // src/app/bridge/page.tsx), and `bridgingBlocked` disables "Review Bridge
  // Transaction" the moment one is entered in non-locked mode, showing
  // BRIDGING_UNAVAILABLE_MESSAGE inline instead of ever letting the user
  // submit — classic Stellar payments can't reach a Soroban contract address
  // yet (issue #284). The review/confirm/sign steps below are unreachable
  // for this destination format today, so this test (and the two below, for
  // the same reason) asserts that real, current, form-level outcome rather
  // than a submission failure this app never lets you attempt.
  test('should complete the full funding flow and report the known #284 limitation', async ({ page }) => {
    await page.goto('/bridge');
    await page.getByTestId('navbar-connect-button').click();
    await expect(page.getByTestId('navbar-address')).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder('CABC...DEF').fill(randomCAddress());
    await page.getByPlaceholder('0.00').fill(AMOUNT);

    await expect(page.getByText(/issue #284/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review Bridge Transaction' })).toBeDisabled();
  });

  // A rejected signature can't be distinguished from any other outcome here:
  // the form disables submission before the wallet is ever asked to sign
  // anything (see the comment above), so setE2EWalletRejectSign has no code
  // path left to affect. Kept (rather than skipped) so this test starts
  // exercising real rejection the moment #284 lands and a signing step
  // becomes reachable, with no rewrite needed beyond removing this note.
  test('should handle rejected signature', async ({ page }) => {
    await page.goto('/bridge');
    await page.getByTestId('navbar-connect-button').click();
    await expect(page.getByTestId('navbar-address')).toBeVisible({ timeout: 10000 });

    await setE2EWalletRejectSign(page, true);

    await page.getByPlaceholder('CABC...DEF').fill(randomCAddress());
    await page.getByPlaceholder('0.00').fill(AMOUNT);

    await expect(page.getByText(/issue #284/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review Bridge Transaction' })).toBeDisabled();
  });

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

  // Same #284 caveat as the two tests above: this exercises the app's real
  // failure-reporting path — a form-level block with an explanatory message —
  // rather than the post-submission failure the name originally implied,
  // since no submission is ever reachable for this destination format today.
  test('should show appropriate error for failed submission', async ({ page }) => {
    await page.goto('/bridge');
    await page.getByTestId('navbar-connect-button').click();
    await expect(page.getByTestId('navbar-address')).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder('CABC...DEF').fill(randomCAddress());
    await page.getByPlaceholder('0.00').fill(AMOUNT);

    await expect(page.getByText(/issue #284/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review Bridge Transaction' })).toBeDisabled();
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
