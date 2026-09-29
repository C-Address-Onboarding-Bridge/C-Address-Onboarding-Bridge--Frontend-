import { isFeatureFlagPanelEnabled } from '../lib/featureFlags';

describe('isFeatureFlagPanelEnabled', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    window.localStorage.clear();
  });

  it('is disabled by default in production', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    expect(isFeatureFlagPanelEnabled()).toBe(false);
  });

  it('is enabled in non-production environments', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    expect(isFeatureFlagPanelEnabled()).toBe(true);
  });

  it('does not trust a client-side localStorage token', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    window.localStorage.setItem('ff_panel_token', 'anything');
    expect(isFeatureFlagPanelEnabled()).toBe(false);
  });

  it('does not read a NEXT_PUBLIC_* token from the client bundle', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      NEXT_PUBLIC_FLAG_PANEL_TOKEN: 'leaked-public-token',
    };
    window.localStorage.setItem('ff_panel_token', 'leaked-public-token');
    expect(isFeatureFlagPanelEnabled()).toBe(false);
  });
});
