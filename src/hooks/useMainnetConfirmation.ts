"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StellarNetwork } from "@/lib/types";
import {
  getMainnetConfirmationReason,
  hasConfirmedMainnetThisSession,
  recordMainnetSessionConfirmation,
  type MainnetConfirmationReason,
} from "@/lib/mainnetConfirmation";

export interface MainnetConfirmation {
  /** The confirmation on screen, or `null` when none is pending. */
  prompt: MainnetConfirmationReason | null;
  /**
   * Resolves `true` when the transaction may be signed: at once off mainnet
   * or when already confirmed, otherwise once the user answers the prompt.
   */
  request: () => Promise<boolean>;
  /** The user's answer to the pending prompt. */
  answer: (confirmed: boolean) => void;
}

/**
 * Gates mainnet transactions behind an explicit confirmation: once per
 * session, and again after a recent network switch until acknowledged.
 * Signing code awaits `request()`; the page renders `prompt` and wires its
 * buttons to `answer`. (#480, #759)
 */
export function useMainnetConfirmation(
  network: StellarNetwork,
  recentlyChangedNetwork: boolean
): MainnetConfirmation {
  const [acknowledgedSwitch, setAcknowledgedSwitch] = useState(false);
  const [prevRecent, setPrevRecent] = useState(recentlyChangedNetwork);
  const [prevNetwork, setPrevNetwork] = useState(network);

  // Reset acknowledgedSwitch whenever a new network change is detected:
  // when recentlyChangedNetwork transitions from false -> true, or when the
  // network itself changes (#1107).
  if (recentlyChangedNetwork !== prevRecent || network !== prevNetwork) {
    const isNewRecentSwitch = !prevRecent && recentlyChangedNetwork;
    const isNetworkChange = network !== prevNetwork;
    setPrevRecent(recentlyChangedNetwork);
    setPrevNetwork(network);
    if (isNewRecentSwitch || isNetworkChange) {
      setAcknowledgedSwitch(false);
    }
  }

  const [prompt, setPrompt] = useState<MainnetConfirmationReason | null>(null);
  const pending = useRef<{
    reason: MainnetConfirmationReason;
    resolve: (confirmed: boolean) => void;
  } | null>(null);

  const prevProps = useRef({ network, recentlyChangedNetwork });
  useEffect(() => {
    const prev = prevProps.current;
    if (
      (!prev.recentlyChangedNetwork && recentlyChangedNetwork) ||
      prev.network !== network
    ) {
      setAcknowledgedSwitch(false);
    }
    prevProps.current = { network, recentlyChangedNetwork };
  }, [network, recentlyChangedNetwork]);

  // An unanswered prompt counts as a cancel if the page goes away. The ref
  // is read at cleanup on purpose: it holds whichever prompt is pending then.
  useEffect(() => {
    const pendingRef = pending;
    return () => pendingRef.current?.resolve(false);
  }, []);

  const request = useCallback((): Promise<boolean> => {
    const reason = getMainnetConfirmationReason(
      network,
      recentlyChangedNetwork,
      acknowledgedSwitch,
      hasConfirmedMainnetThisSession()
    );
    if (!reason) return Promise.resolve(true);
    // A prompt already waiting is superseded by this one.
    pending.current?.resolve(false);
    setPrompt(reason);
    return new Promise<boolean>((resolve) => {
      pending.current = { reason, resolve };
    });
  }, [network, recentlyChangedNetwork, acknowledgedSwitch]);

  const answer = useCallback((confirmed: boolean) => {
    const current = pending.current;
    pending.current = null;
    setPrompt(null);
    if (!current) return;
    if (confirmed) {
      // Only answering the switch warning acknowledges the switch; either
      // prompt counts as the session's mainnet confirmation.
      if (current.reason === "network_switch") setAcknowledgedSwitch(true);
      recordMainnetSessionConfirmation();
    }
    current.resolve(confirmed);
  }, []);

  return { prompt, request, answer };
}
