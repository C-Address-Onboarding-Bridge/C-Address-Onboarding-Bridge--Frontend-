import type { StellarNetwork } from "./types";

/**
 * Mainnet transaction confirmation (#759).
 *
 * Before #759 the bridge asked for confirmation on mainnet only right after a
 * network switch (#480), so a user who opened the app already on mainnet sent
 * real funds without any extra step. Now the first mainnet transaction of each
 * browser session also needs an explicit confirmation, remembered in
 * sessionStorage until the tab session ends.
 *
 * Kept apart from `./stellar` so pages and tests that stub that module still
 * get the real confirmation logic.
 */

/** sessionStorage key recording that mainnet transactions were confirmed this session. */
export const MAINNET_SESSION_CONFIRMATION_KEY = "bridge:mainnet-confirmed";

function sessionStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Whether the user already confirmed sending real funds on mainnet in this
 * browser session. Unreadable storage counts as "not confirmed", so the
 * prompt errs on the side of asking again.
 */
export function hasConfirmedMainnetThisSession(): boolean {
  try {
    return sessionStore()?.getItem(MAINNET_SESSION_CONFIRMATION_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember the mainnet confirmation until the browser session ends. */
export function recordMainnetSessionConfirmation(): void {
  try {
    sessionStore()?.setItem(MAINNET_SESSION_CONFIRMATION_KEY, "1");
  } catch {
    // Storage blocked or full: the user is simply asked again next time.
  }
}

/** Why a mainnet action needs an explicit confirmation. */
export type MainnetConfirmationReason = "network_switch" | "session";

/**
 * Which confirmation, if any, a transaction needs before signing:
 *
 * - `"network_switch"` on mainnet when the network changed recently and the
 *   user has not acknowledged it (the #480 warning);
 * - `"session"` for the first mainnet transaction of the session;
 * - `null` otherwise, and always off mainnet.
 */
export function getMainnetConfirmationReason(
  network: StellarNetwork,
  recentlyChangedNetwork: boolean,
  acknowledgedSwitch: boolean,
  confirmedThisSession: boolean
): MainnetConfirmationReason | null {
  if (network !== "PUBLIC") return null;
  if (recentlyChangedNetwork && !acknowledgedSwitch) return "network_switch";
  return confirmedThisSession ? null : "session";
}

/** Prompt copy for each reason. */
export const MAINNET_CONFIRMATION_MESSAGES: Record<
  MainnetConfirmationReason,
  { title: string; body: string }
> = {
  network_switch: {
    title: "You just switched to Mainnet",
    body: "This transaction will send real funds on Stellar Mainnet. Make sure the network switch was intended before continuing.",
  },
  session: {
    title: "This transaction uses Mainnet",
    body: "You are about to send real funds on Stellar Mainnet. Transactions cannot be reversed. You won't be asked again this session.",
  },
};
