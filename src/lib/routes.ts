/**
 * Centralized route definitions and navigation helpers.
 * #362
 */

export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  BRIDGE: '/bridge',
  ONRAMP: '/onramp',
  CEX: '/cex',
  PROFILE: '/profile',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

export interface RouteConfig {
  path: RoutePath;
  label: string;
  requiresWallet: boolean;
  icon?: string;
}

export const ROUTE_CONFIGS: RouteConfig[] = [
  { path: ROUTES.DASHBOARD, label: 'Dashboard', requiresWallet: true },
  { path: ROUTES.BRIDGE, label: 'Bridge', requiresWallet: true },
  { path: ROUTES.ONRAMP, label: 'On-Ramp', requiresWallet: false },
  { path: ROUTES.CEX, label: 'CEX', requiresWallet: false },
  // Profile data is keyed on the connected address, so there is nothing to show
  // without a wallet. (#325)
  { path: ROUTES.PROFILE, label: 'Profile', requiresWallet: true },
];

/**
 * Get the navigation items, optionally filtering by wallet connection state.
 */
export function getNavItems(isWalletConnected: boolean = false): RouteConfig[] {
  return ROUTE_CONFIGS.filter(
    (route) => !route.requiresWallet || isWalletConnected,
  );
}

/**
 * Check if a path matches a route (supports exact and prefix matching).
 */
export function isActiveRoute(currentPath: string, routePath: string): boolean {
  if (routePath === '/') return currentPath === '/';
  return currentPath === routePath || currentPath.startsWith(`${routePath}/`);
}

/**
 * Get breadcrumb segments from a path.
 */
export function getBreadcrumbs(path: string): Array<{ label: string; path: string }> {
  const segments = path.split('/').filter(Boolean);
  const breadcrumbs = [{ label: 'Home', path: '/' }];
  let current = '';
  for (const segment of segments) {
    current += `/${segment}`;
    const config = ROUTE_CONFIGS.find((r) => r.path === current);
    breadcrumbs.push({
      label: config?.label || segment.charAt(0).toUpperCase() + segment.slice(1),
      path: current,
    });
  }
  return breadcrumbs;
}
