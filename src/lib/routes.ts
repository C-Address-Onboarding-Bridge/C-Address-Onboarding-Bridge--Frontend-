/**
 * Centralized route definitions and navigation helpers.
 * #362, #1120
 */
import type { ComponentType } from 'react';
import {
  ArrowLeftRight,
  CreditCard,
  Building2,
  LayoutDashboard,
  BookUser,
  CalendarClock,
  Share2,
  UserRound,
} from 'lucide-react';

export const ROUTES = {
  HOME: '/',
  BRIDGE: '/bridge',
  ONRAMP: '/onramp',
  CEX: '/cex',
  DASHBOARD: '/dashboard',
  ADDRESS_BOOK: '/address-book',
  SCHEDULES: '/schedules',
  REFERRALS: '/referrals',
  PROFILE: '/profile',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

export interface RouteConfig {
  path: RoutePath;
  label: string;
  requiresWallet: boolean;
  icon?: ComponentType<{ className?: string }>;
  footerLabel?: string;
}

export const ROUTE_CONFIGS: RouteConfig[] = [
  { path: ROUTES.BRIDGE, label: 'Bridge', requiresWallet: true, icon: ArrowLeftRight, footerLabel: 'G → C Bridge' },
  { path: ROUTES.ONRAMP, label: 'Onramp', requiresWallet: false, icon: CreditCard, footerLabel: 'Fiat Onramp' },
  { path: ROUTES.CEX, label: 'CEX', requiresWallet: false, icon: Building2, footerLabel: 'CEX Withdrawal' },
  { path: ROUTES.DASHBOARD, label: 'Dashboard', requiresWallet: true, icon: LayoutDashboard },
  { path: ROUTES.ADDRESS_BOOK, label: 'Address Book', requiresWallet: true, icon: BookUser },
  { path: ROUTES.SCHEDULES, label: 'Schedules', requiresWallet: true, icon: CalendarClock },
  { path: ROUTES.REFERRALS, label: 'Referrals', requiresWallet: false, icon: Share2 },
  { path: ROUTES.PROFILE, label: 'Profile', requiresWallet: true, icon: UserRound },
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
