import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-End test configuration for the C-Address Bridge (#496).
 *
 * Tests cover the full funding flow: connect wallet, enter recipient, review,
 * sign, and see result. The wallet is mocked via `window.__E2E_WALLET__` and
 * Horizon responses are mocked with `page.route` so specs that never submit
 * need no live testnet. A tagged `@network` spec funds a real testnet account
 * through Friendbot and can be skipped with `--grep-invert @network`.
 */

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

// On PRs, run only chromium for speed; on main (push events), run all browsers.
const isMain = process.env.GITHUB_REF === 'refs/heads/main';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html'], ['list'], ['json', { outputFile: 'e2e-results.json' }]]
    : [['html'], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: isMain
    ? [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      ]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
      ],

  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
