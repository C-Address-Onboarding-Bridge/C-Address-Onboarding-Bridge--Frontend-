import { test, expect } from '@playwright/test';
import { setupMockWallet, connectMockWallet, setMockWalletRejectSign } from './fixtures/mock-wallet';

const MOCK_G_ADDRESS = 'GDZST3XVCDTUJ76ZAV2HA72KYXM4Y5LTTKCMDUHV4DZUMVAWPHFMEQZT';
const MOCK_C_ADDRESS = 'CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

test.describe('Funding Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Setup mock wallet for each test
    await setupMockWallet(page, {
      publicKey: MOCK_G_ADDRESS,
      isConnected: false,
    });
  });

  test('should successfully connect wallet and initiate bridge transfer', async ({ page }) => {
    await page.goto('/bridge');

    // Verify we're on the bridge page
    await expect(page).toHaveTitle(/Bridge/);

    // Click connect wallet button
    const connectButton = page.getByRole('button', { name: /connect/i });
    await expect(connectButton).toBeVisible();
    await connectButton.click();

    // After connection, the button should show the connected address
    await expect(page.getByText(MOCK_G_ADDRESS.substring(0, 4))).toBeVisible({
      timeout: 5000,
    });
  });

  test('should complete the full funding flow successfully', async ({ page }) => {
    await page.goto('/bridge');

    // Connect wallet
    const connectButton = page.getByRole('button', { name: /connect/i });
    await connectButton.click();

    // Wait for connection to complete
    await page.waitForTimeout(500);
    await connectMockWallet(page);

    // Enter C-address (recipient)
    const recipientInput = page.getByPlaceholder(/recipient|address|c-address/i).first();
    if (recipientInput) {
      await recipientInput.fill(MOCK_C_ADDRESS);
    }

    // Enter amount
    const amountInput = page.getByPlaceholder(/amount|send|xlm/i).first();
    if (amountInput) {
      await amountInput.fill('10');
    }

    // Click review/submit button
    const submitButton = page.getByRole('button', { name: /review|submit|send|continue/i });
    if (submitButton) {
      await submitButton.click();

      // Wait for signature prompt
      await page.waitForTimeout(500);

      // The mock wallet should sign successfully
      await expect(page.getByText(/success|confirmed|submitted/i)).toBeVisible({
        timeout: 10000,
      });
    }
  });

  test('should handle rejected signature', async ({ page }) => {
    await page.goto('/bridge');

    // Connect wallet
    const connectButton = page.getByRole('button', { name: /connect/i });
    await connectButton.click();
    await connectMockWallet(page);

    // Setup wallet to reject signing
    await setMockWalletRejectSign(page, true);

    // Enter C-address
    const recipientInput = page.getByPlaceholder(/recipient|address|c-address/i).first();
    if (recipientInput) {
      await recipientInput.fill(MOCK_C_ADDRESS);
    }

    // Enter amount
    const amountInput = page.getByPlaceholder(/amount|send|xlm/i).first();
    if (amountInput) {
      await amountInput.fill('10');
    }

    // Try to submit
    const submitButton = page.getByRole('button', { name: /review|submit|send|continue/i });
    if (submitButton) {
      await submitButton.click();
      await page.waitForTimeout(500);

      // Should show error about signature rejection
      await expect(
        page.getByText(/rejected|declined|canceled/i)
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('should handle wallet disconnect and reconnect', async ({ page }) => {
    await page.goto('/bridge');

    // Connect wallet
    const connectButton = page.getByRole('button', { name: /connect/i });
    await connectButton.click();
    await connectMockWallet(page);

    // Verify connected state
    await expect(page.getByText(MOCK_G_ADDRESS.substring(0, 4))).toBeVisible();

    // Simulate disconnect
    await page.evaluate(() => {
      if (window.__MOCK_WALLET__) {
        window.__MOCK_WALLET__.isConnected = false;
      }
    });

    // UI should reflect disconnected state
    await expect(page.getByRole('button', { name: /connect/i })).toBeVisible({
      timeout: 5000,
    });

    // Reconnect
    await connectButton.click();
    await connectMockWallet(page);

    // Should be connected again
    await expect(page.getByText(MOCK_G_ADDRESS.substring(0, 4))).toBeVisible({
      timeout: 5000,
    });
  });

  test('should show appropriate error for failed submission', async ({ page }) => {
    // Intercept and mock an API error response
    await page.route('**/api/**', (route) => {
      route.abort('failed');
    });

    await page.goto('/bridge');

    // Connect and try to submit
    const connectButton = page.getByRole('button', { name: /connect/i });
    await connectButton.click();
    await connectMockWallet(page);

    // Try submission (which will fail due to our route abort)
    const submitButton = page.getByRole('button', { name: /review|submit|send|continue/i });
    if (submitButton) {
      await submitButton.click();
      await page.waitForTimeout(500);

      // Should show error message
      await expect(
        page.getByText(/error|failed|failed to|unable/i)
      ).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('Funding Flow - Onramp', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockWallet(page, {
      publicKey: MOCK_G_ADDRESS,
      isConnected: false,
    });
  });

  test('should display onramp providers', async ({ page }) => {
    await page.goto('/onramp');

    // Should see provider options (Moonpay, Transak, etc)
    await expect(page.getByText(/moonpay|transak|provider/i)).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe('Funding Flow - CEX', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockWallet(page, {
      publicKey: MOCK_G_ADDRESS,
      isConnected: false,
    });
  });

  test('should display CEX instructions', async ({ page }) => {
    await page.goto('/cex');

    // Should display CEX withdrawal instructions
    await expect(page.getByText(/cex|exchange|withdrawal|deposit/i)).toBeVisible({
      timeout: 5000,
    });
  });
});
