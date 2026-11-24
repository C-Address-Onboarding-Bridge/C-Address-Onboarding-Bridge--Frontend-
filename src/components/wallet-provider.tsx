"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { checkConnection, getWalletAddress, getWalletNetwork, switchWalletNetwork, initWalletKit, openWalletSelectionResult, type SwitchNetworkResult } from "@/lib/stellar";
import { APP_NETWORK, isSupportedNetwork, type StellarNetwork, type WalletNetworkState } from "@/lib/types";
import { loadSession, markConnected, markDisconnected } from "@/lib/session";
import { handleError } from "@/lib/errors";
import { useHydrated } from "@/hooks/useHydrated";
import {
  cancelOperation as removeOperation,
  createOperationId,
  fundingOperations,
  operationsToReplay,
  removeOperations,
  type QueuedOperation,
} from "@/lib/offlineQueue";

interface WalletContextType {
  address: string | null;
  publicKey: string | null;
  network: StellarNetwork;
  networkStatus: WalletNetworkState;
  walletNetworkName: string | null;
  isNetworkSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  /** User-facing error message from the last failed connect() attempt, or null. (#948) */
  connectError: string | null;
  /** Clears connectError explicitly. (#948) */
  clearConnectError: () => void;
  networkMismatch: boolean;
  dismissNetworkMismatch: () => void;
  networkChangedAt: number | null;
  recentlyChangedNetwork: boolean;
  switchNetwork: (target: "PUBLIC" | "TESTNET") => Promise<SwitchNetworkResult>;
  connect: () => Promise<void>;
  disconnect: () => void;
  isOnline: boolean;
  pendingOperations: QueuedOperation[];
  enqueueOperation: (operation: Omit<QueuedOperation, "id">) => string;
  cancelOperation: (id: string) => void;
  confirmFunding: () => Promise<void>;
  selectedWalletId: string | null;
  openWalletModal: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

const FAST_INTERVAL = 3000;
const SLOW_INTERVAL = 10000;
const BACKOFF_THRESHOLD_MS = 30000;
const RECENT_NETWORK_CHANGE_MS = 60_000;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<StellarNetwork>(APP_NETWORK);
  const [networkStatus, setNetworkStatus] = useState<WalletNetworkState>(APP_NETWORK);
  const [walletNetworkName, setWalletNetworkName] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [selectedWalletIdState, setSelectedWalletId] = useState<string | null>(null);
  const hydrated = useHydrated();
  const selectedWalletId = selectedWalletIdState ?? (hydrated ? loadSession().selectedWalletId : null);
  const [networkMismatch, setNetworkMismatch] = useState(false);
  const [networkChangedAt, setNetworkChangedAt] = useState<number | null>(null);
  const [networkChangedRecently, setNetworkChangedRecently] = useState(false);
  const recentChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousNetworkStatusRef = useRef<WalletNetworkState>(APP_NETWORK);
  const initialNetworkRef = useRef<"PUBLIC" | "TESTNET" | null>(null);
  const dismissedRef = useRef(false);
  const manuallyDisconnectedRef = useRef<boolean | null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const isOnlineRef = useRef(true);
  const [pendingOperations, setPendingOperations] = useState<QueuedOperation[]>([]);
  const pendingRef = useRef<QueuedOperation[]>([]);

  const clearConnectError = useCallback(() => {
    setConnectError(null);
  }, []);

  const setPending = useCallback((next: QueuedOperation[] | ((prev: QueuedOperation[]) => QueuedOperation[])) => {
    setPendingOperations((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      pendingRef.current = resolved;
      return resolved;
    });
  }, []);

  const replaySafeOperations = useCallback(() => {
    const safe = operationsToReplay(pendingRef.current);
    for (const op of safe) {
      if (op.run) void Promise.resolve(op.run());
    }
    if (safe.length > 0) {
      setPending(removeOperations(pendingRef.current, safe.map((op) => op.id)));
    }
  }, [setPending]);

  const enqueueOperation = useCallback(
    (operation: Omit<QueuedOperation, "id">) => {
      const id = createOperationId();
      const full: QueuedOperation = { ...operation, id };
      setPending((prev) => [...prev, full]);
      if (isOnlineRef.current && operation.kind === "safe" && operation.run) {
        void Promise.resolve(operation.run())
          .then(() => setPending((prev) => removeOperation(prev, id)))
          .catch((e) => {
            handleError(e, "wallet:enqueueOperation");
          });
      }
      return id;
    },
    [setPending],
  );

  const cancelOperation = useCallback(
    (id: string) => {
      setPending((prev) => removeOperation(prev, id));
    },
    [setPending],
  );

  const confirmFunding = useCallback(async () => {
    const funding = fundingOperations(pendingRef.current);
    try {
      for (const op of funding) {
        if (op.run) await Promise.resolve(op.run());
      }
    } catch (e) {
      handleError(e, "wallet:confirmFunding");
      throw e;
    }
    if (funding.length > 0) {
      setPending(removeOperations(pendingRef.current, funding.map((op) => op.id)));
    }
  }, [setPending]);

  useEffect(() => {
    const session = loadSession();
    if (session.selectedWalletId && !session.manuallyDisconnected) {
      void initWalletKit(session.selectedWalletId);
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      const online = typeof navigator === "undefined" ? true : navigator.onLine;
      isOnlineRef.current = online;
      setIsOnline(online);
    };
    const goOnline = () => {
      isOnlineRef.current = true;
      setIsOnline(true);
      replaySafeOperations();
    };
    const goOffline = () => {
      isOnlineRef.current = false;
      setIsOnline(false);
    };

    sync();
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [replaySafeOperations]);

  const isManuallyDisconnected = useCallback(() => {
    if (manuallyDisconnectedRef.current === null) {
      manuallyDisconnectedRef.current = loadSession().manuallyDisconnected;
    }
    return manuallyDisconnectedRef.current;
  }, []);

  const dismissNetworkMismatch = useCallback(() => {
    dismissedRef.current = true;
    setNetworkMismatch(false);
  }, []);

  const applyNetwork = useCallback((status: WalletNetworkState, name: string | null) => {
    if (previousNetworkStatusRef.current !== status) {
      previousNetworkStatusRef.current = status;
      setNetworkChangedAt(Date.now());
      setNetworkChangedRecently(true);
      if (recentChangeTimerRef.current) clearTimeout(recentChangeTimerRef.current);
      recentChangeTimerRef.current = setTimeout(
        () => setNetworkChangedRecently(false),
        RECENT_NETWORK_CHANGE_MS
      );
    }
    setNetworkStatus(status);
    setWalletNetworkName(name);
    if (isSupportedNetwork(status)) {
      setNetwork(status);
    }
    return status;
  }, []);

  const updateConnection = useCallback(async () => {
    const resetToDisconnected = () => {
      setAddress(null);
      initialNetworkRef.current = null;
      dismissedRef.current = false;
      setNetworkMismatch(false);
      setNetworkStatus(APP_NETWORK);
      setWalletNetworkName(null);
      previousNetworkStatusRef.current = APP_NETWORK;
      setNetworkChangedAt(null);
      setNetworkChangedRecently(false);
      if (recentChangeTimerRef.current) clearTimeout(recentChangeTimerRef.current);
    };

    try {
      if (isManuallyDisconnected()) return;

      const isConnected = await checkConnection();
      if (isConnected) {
        const pk = await getWalletAddress();
        const { status, name } = await getWalletNetwork();
        setAddress(pk);
        applyNetwork(status, name);

        if (!isSupportedNetwork(status)) return;

        if (initialNetworkRef.current === null) {
          initialNetworkRef.current = status;
        } else if (!dismissedRef.current && status !== initialNetworkRef.current) {
          setNetworkMismatch(true);
          initialNetworkRef.current = status;
        }
      } else {
        resetToDisconnected();
      }
    } catch {
      resetToDisconnected();
    }
  }, [applyNetwork, isManuallyDisconnected]);

  const switchNetwork = useCallback(
    async (target: "PUBLIC" | "TESTNET"): Promise<SwitchNetworkResult> => {
      const result = await switchWalletNetwork(target);
      await updateConnection();
      return result;
    },
    [updateConnection]
  );

  const connect = useCallback(async () => {
    // Clear any previous error at the start of a new connection attempt. (#948)
    setConnectError(null);
    manuallyDisconnectedRef.current = false;
    setIsConnecting(true);
    try {
      const result = await openWalletSelectionResult();
      if (result.status === "connected") {
        const { address: pk, walletId } = result;
        markConnected(pk, Date.now(), walletId);
        setAddress(pk);
        setSelectedWalletId(walletId);
        const { status, name } = await getWalletNetwork();
        applyNetwork(status, name);
        initialNetworkRef.current = isSupportedNetwork(status) ? status : null;
        dismissedRef.current = false;
        setNetworkMismatch(false);
      } else if (result.status === "error") {
        manuallyDisconnectedRef.current = loadSession().manuallyDisconnected;
        const err = new Error(result.message);
        handleError(err, "wallet:connect");
        setConnectError(result.message);
      } else {
        // User dismissed the modal: keep connectError null and preserve session state. (#948)
        manuallyDisconnectedRef.current = loadSession().manuallyDisconnected;
      }
    } catch (e) {
      manuallyDisconnectedRef.current = loadSession().manuallyDisconnected;
      handleError(e, "wallet:connect");
      const message =
        e instanceof Error && e.message
          ? e.message
          : "Failed to connect wallet. Please try again.";
      setConnectError(message);
    } finally {
      setIsConnecting(false);
    }
  }, [applyNetwork]);

  const disconnect = useCallback(() => {
    manuallyDisconnectedRef.current = true;
    markDisconnected(address);
    setAddress(null);
    setConnectError(null);
    initialNetworkRef.current = null;
    dismissedRef.current = false;
    setNetworkMismatch(false);
    setNetworkStatus(APP_NETWORK);
    setWalletNetworkName(null);
    previousNetworkStatusRef.current = APP_NETWORK;
    setNetworkChangedAt(null);
    setNetworkChangedRecently(false);
    if (recentChangeTimerRef.current) clearTimeout(recentChangeTimerRef.current);
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    let fastTimer: ReturnType<typeof setTimeout> | null = null;
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffTimer: ReturnType<typeof setTimeout> | null = null;
    let isFast = true;

    const clearAllTimers = () => {
      if (fastTimer) clearTimeout(fastTimer);
      if (slowTimer) clearTimeout(slowTimer);
      if (backoffTimer) clearTimeout(backoffTimer);
    };

    const scheduleNext = () => {
      clearAllTimers();
      const delay = isFast ? FAST_INTERVAL : SLOW_INTERVAL;
      const timer = setTimeout(() => {
        updateConnection().finally(scheduleNext);
      }, delay);
      if (isFast) {
        fastTimer = timer;
      } else {
        slowTimer = timer;
      }
    };

    const startBackoff = () => {
      if (backoffTimer) clearTimeout(backoffTimer);
      backoffTimer = setTimeout(() => {
        isFast = false;
        scheduleNext();
      }, BACKOFF_THRESHOLD_MS);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearAllTimers();
      } else {
        isFast = true;
        updateConnection().finally(() => {
          if (cancelled) return;
          startBackoff();
          scheduleNext();
        });
      }
    };

    queueMicrotask(() => {
      if (cancelled) return;
      updateConnection().finally(() => {
        if (cancelled) return;
        startBackoff();
        scheduleNext();
      });
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearAllTimers();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [updateConnection]);

  return (
    <WalletContext.Provider
      value={{
        address,
        publicKey: address,
        network,
        networkStatus,
        walletNetworkName,
        isNetworkSupported: isSupportedNetwork(networkStatus),
        isConnected: !!address,
        isConnecting,
        connectError,
        clearConnectError,
        networkMismatch,
        dismissNetworkMismatch,
        networkChangedAt,
        recentlyChangedNetwork: networkChangedRecently,
        switchNetwork,
        connect,
        disconnect,
        isOnline,
        pendingOperations,
        enqueueOperation,
        cancelOperation,
        confirmFunding,
        selectedWalletId,
        openWalletModal: connect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}