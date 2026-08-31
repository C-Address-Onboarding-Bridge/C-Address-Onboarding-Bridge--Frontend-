import { Page } from '@playwright/test';

/**
 * Mock Freighter wallet extension for E2E testing (#496).
 *
 * Injects a mock wallet provider into the page that simulates the
 * @stellar/freighter-api interface without requiring actual wallet software.
 */

declare global {
  interface Window {
    __MOCK_WALLET__?: {
      publicKey: string;
      isConnected: boolean;
      shouldRejectSign: boolean;
    };
    __freighter__?: {
      requestAccess: () => Promise<{ publicKey: string }>;
      getPublicKey: () => Promise<string>;
      isConnected: () => Promise<boolean>;
      signTransaction: (xdr: string) => Promise<{ envelope_xdr: string; signature: string }>;
      signAuthEntry: (entry: string) => Promise<string>;
      disconnect: () => Promise<void>;
    };
  }
}

interface MockWalletConfig {
  publicKey?: string;
  isConnected?: boolean;
  shouldRejectSign?: boolean;
}

export async function setupMockWallet(
  page: Page,
  config: MockWalletConfig = {}
) {
  const {
    publicKey = 'GDZST3XVCDTUJ76ZAV2HA72KYXM4Y5LTTKCMDUHV4DZUMVAWPHFMEQZT',
    isConnected = false,
    shouldRejectSign = false,
  } = config;

  await page.addInitScript(
    ({ publicKey, isConnected, shouldRejectSign }) => {
      window.__MOCK_WALLET__ = {
        publicKey,
        isConnected,
        shouldRejectSign,
      };

      // Mock the Freighter API
      const mockFreighter = {
        requestAccess: async () => {
          if (window.__MOCK_WALLET__) {
            window.__MOCK_WALLET__.isConnected = true;
          }
          return { publicKey };
        },

        getPublicKey: async () => {
          if (!window.__MOCK_WALLET__?.isConnected) {
            throw new Error('Wallet not connected');
          }
          return publicKey;
        },

        isConnected: async () => window.__MOCK_WALLET__?.isConnected ?? false,

        signTransaction: async (xdr: string) => {
          if (window.__MOCK_WALLET__?.shouldRejectSign) {
            throw new Error('User rejected signature');
          }
          return {
            envelope_xdr: xdr,
            signature: 'MOCKED_SIGNATURE_' + publicKey.substring(0, 10),
          };
        },

        signAuthEntry: async () => {
          if (window.__MOCK_WALLET__?.shouldRejectSign) {
            throw new Error('User rejected signature');
          }
          return 'MOCKED_AUTH_SIGNATURE_' + publicKey.substring(0, 10);
        },

        disconnect: async () => {
          if (window.__MOCK_WALLET__) {
            window.__MOCK_WALLET__.isConnected = false;
          }
        },
      };

      // Make the mock wallet globally available as if the extension injected it
      if (typeof window !== 'undefined') {
        Object.defineProperty(window, '__freighter__', {
          value: mockFreighter,
          writable: false,
          configurable: false,
        });
      }
    },
    { publicKey, isConnected, shouldRejectSign }
  );
}

export async function connectMockWallet(page: Page) {
  // Simulate clicking connect wallet button and accepting the connection
  await page.evaluate(() => {
    if (window.__MOCK_WALLET__) {
      window.__MOCK_WALLET__.isConnected = true;
    }
  });
}

export async function disconnectMockWallet(page: Page) {
  await page.evaluate(() => {
    if (window.__MOCK_WALLET__) {
      window.__MOCK_WALLET__.isConnected = false;
    }
  });
}

export async function setMockWalletRejectSign(page: Page, shouldReject: boolean) {
  await page.evaluate((shouldReject) => {
    if (window.__MOCK_WALLET__) {
      window.__MOCK_WALLET__.shouldRejectSign = shouldReject;
    }
  }, shouldReject);
}
