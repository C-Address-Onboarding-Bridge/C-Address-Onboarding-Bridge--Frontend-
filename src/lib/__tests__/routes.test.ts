import { describe, it, expect } from 'vitest';
import {
  ROUTES,
  ROUTE_CONFIGS,
  getNavItems,
  isActiveRoute,
  getBreadcrumbs,
} from '../routes';

describe('Routing (#362)', () => {
  describe('ROUTES', () => {
    it('defines all expected routes', () => {
      expect(ROUTES.HOME).toBe('/');
      expect(ROUTES.DASHBOARD).toBe('/dashboard');
      expect(ROUTES.BRIDGE).toBe('/bridge');
      expect(ROUTES.ONRAMP).toBe('/onramp');
      expect(ROUTES.CEX).toBe('/cex');
    });
  });

  describe('getNavItems', () => {
    it('returns only public routes when wallet not connected', () => {
      const items = getNavItems(false);
      const paths = items.map((i) => i.path);
      expect(paths).not.toContain(ROUTES.DASHBOARD);
      expect(paths).not.toContain(ROUTES.BRIDGE);
      expect(paths).toContain(ROUTES.ONRAMP);
      expect(paths).toContain(ROUTES.CEX);
    });

    it('returns all routes when wallet is connected', () => {
      const items = getNavItems(true);
      expect(items.length).toBe(ROUTE_CONFIGS.length);
    });
  });

  describe('isActiveRoute', () => {
    it('matches exact routes', () => {
      expect(isActiveRoute('/bridge', '/bridge')).toBe(true);
      expect(isActiveRoute('/dashboard', '/bridge')).toBe(false);
    });

    it('matches prefix routes', () => {
      expect(isActiveRoute('/bridge/status', '/bridge')).toBe(true);
    });

    it('home only matches exactly', () => {
      expect(isActiveRoute('/', '/')).toBe(true);
      expect(isActiveRoute('/bridge', '/')).toBe(false);
    });
  });

  describe('getBreadcrumbs', () => {
    it('returns Home for root', () => {
      const crumbs = getBreadcrumbs('/');
      expect(crumbs).toHaveLength(1);
      expect(crumbs[0].label).toBe('Home');
    });

    it('builds breadcrumbs from path', () => {
      const crumbs = getBreadcrumbs('/bridge');
      expect(crumbs).toHaveLength(2);
      expect(crumbs[0].label).toBe('Home');
      expect(crumbs[1].label).toBe('Bridge');
    });

    it('capitalizes unknown segments', () => {
      const crumbs = getBreadcrumbs('/settings');
      expect(crumbs[1].label).toBe('Settings');
    });
  });
});
