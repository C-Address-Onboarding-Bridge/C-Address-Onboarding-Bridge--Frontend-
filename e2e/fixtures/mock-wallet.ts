import { Page } from '@playwright/test';
import { Keypair } from '@stellar/stellar-sdk';

/**
 * E2E wallet test hook (#669).
 *
 * The app connects and signs through the Stellar Wallets Kit
 * (`@creit.tech/stellar-wallets-kit`), which renders its own modal and, for
 * Freighter, talks to a real browser-extension protocol — there is no
 * supported way to drive either deterministically in a Playwright browser.
 * `src/lib/stellar.ts` checks for `window.__E2E_WALLET__` (injected here via
 * `page.addInitScript`, so it's present before the app's own scripts run) at
 * every kit touchpoint — connect, address/network reads, and signing — and
 * resolves with this configuration instead of calling the kit.
 *
 * Signing uses a real, disposable testnet keypair funded by Stellar's public
 * Friendbot faucet, so the funding flow's actual Horizon calls (sequence
 * number, fee stats, transaction submission) run for real against testnet
 * rather than needing their response shapes guessed and mocked.
 */

declare global {
  interface Window {
    __E2E_WALLET__?: {
      address: string;
      secret: string;
      network: 'TESTNET' | 'PUBLIC';
      walletId: string;
      shouldRejectSign?: boolean;
    };
  }
}

export interface E2EWallet {
  address: string;
  secret: string;
}

const FRIENDBOT_URL = 'https://friendbot.stellar.org';

/**
 * Generates a fresh testnet keypair and funds it via Friendbot. Each e2e run
 * gets its own account, so parallel/repeated runs never race over a shared
 * account's sequence number or balance.
 */
export async function createFundedTestWallet(): Promise<E2EWallet> {
  const keypair = Keypair.random();
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(keypair.publicKey())}`);
  if (!response.ok) {
    throw new Error(
      `Friendbot funding failed for ${keypair.publicKey()}: ${response.status} ${await response.text()}`
    );
  }
  return { address: keypair.publicKey(), secret: keypair.secret() };
}

/**
 * Injects the e2e wallet hook into the page before any app script runs.
 * Call once per test, before `page.goto(...)`.
 */
export async function setupE2EWallet(
  page: Page,
  wallet: E2EWallet,
  options: { network?: 'TESTNET' | 'PUBLIC'; walletId?: string; shouldRejectSign?: boolean } = {}
) {
  const { network = 'TESTNET', walletId = 'freighter', shouldRejectSign = false } = options;
  await page.addInitScript(
    ({ address, secret, network, walletId, shouldRejectSign }) => {
      window.__E2E_WALLET__ = { address, secret, network, walletId, shouldRejectSign };
    },
    { address: wallet.address, secret: wallet.secret, network, walletId, shouldRejectSign }
  );
}

/** Toggle whether the next sign attempt should be rejected, as if the user declined in their wallet. */
export async function setE2EWalletRejectSign(page: Page, shouldReject: boolean) {
  await page.evaluate((shouldReject) => {
    if (window.__E2E_WALLET__) {
      window.__E2E_WALLET__.shouldRejectSign = shouldReject;
    }
  }, shouldReject);
}
