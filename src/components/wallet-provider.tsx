"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { checkConnection, getWalletAddress, getWalletNetwork, switchWalletNetwork, initWalletKit, openWalletSelectionModal, type SwitchNetworkResult } from "@/lib/stellar";
import { APP_NETWORK, isSupportedNetwork, type StellarNetwork, type WalletNetworkState } from "@/lib/types";
import { loadSession, markConnected, markDisconnected } from "@/lib/session";
import { handleError } from "@/lib/errors";
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
  /**
   * The network the app targets for Horizon/Soroban endpoints. Only ever a
   * network the app supports — it holds its previous value (or APP_NETWORK)
   * while the wallet is on an unsupported/unreadable network, which is why
   * `networkStatus` must be consulted before building any transaction. (#289)
   */
  network: StellarNetwork;
  /** The wallet's actual network state, including UNSUPPORTED/UNKNOWN. (#289) */
  networkStatus: WalletNetworkState;
  /** Raw network name Freighter reported, e.g. "FUTURENET". Null if unreadable. */
  walletNetworkName: string | null;
  /** True when the wallet is on a network the app can transact on. */
  isNetworkSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  /** True when the network changed mid-session (after initial connection). */
  networkMismatch: boolean;
  /** Call to dismiss the network-mismatch banner for the current session. */
  dismissNetworkMismatch: () => void;
  /** Epoch ms of the last network change, or null when none this session. (#480) */
  networkChangedAt: number | null;
  /** True when the network changed within the last few seconds. (#480) */
  recentlyChangedNetwork: boolean;
  /**
   * Requests a network change through the wallet. Resolves with "switched"
   * when the wallet confirmed, "cancelled" when it declined, or "manual"
   * when the wallet has no programmatic switch API. (#480)
   */
  switchNetwork: (target: "PUBLIC" | "TESTNET") => Promise<SwitchNetworkResult>;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** True when the browser reports an active network connection. (#475) */
  isOnline: boolean;
  /** Operations parked while offline or awaiting funding confirmation. (#475) */
  pendingOperations: QueuedOperation[];
  /**
   * Parks an operation. `safe` ops replay automatically on reconnect; `funding`
   * ops stay queued for explicit confirmation. Returns the new operation's id.
   */
  enqueueOperation: (operation: Omit<QueuedOperation, "id">) => string;
  /** Removes a queued operation, e.g. a user cancellation. */
  cancelOperation: (id: string) => void;
  /** Replays queued funding submissions after explicit user confirmation. */
  confirmFunding: () => Promise<void>;
  /**
   * The wallet ID last selected by the user via the Stellar Wallets Kit modal
   * (e.g. "freighter", "xbull", "lobstr"). Null until a wallet is connected. (#459)
   */
  selectedWalletId: string | null;
  /**
   * Opens the Stellar Wallets Kit wallet selection modal programmatically.
   * Equivalent to calling connect() but makes the modal intent explicit. (#459)
   */
  openWalletModal: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

/** Polling intervals in milliseconds. */
const FAST_INTERVAL = 3000;
const SLOW_INTERVAL = 10000;
/** Time before backing off from fast to slow interval. */
const BACKOFF_THRESHOLD_MS = 30000;
/**
 * Window during which a network change is treated as "recent" so mainnet
 * actions are warned about. (#480)
 */
const RECENT_NETWORK_CHANGE_MS = 60_000;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  // Use APP_NETWORK as the initial/disconnected network so the app targets the
  // correct Horizon and Soroban RPC endpoints before a wallet is connected.
  // NEXT_PUBLIC_STELLAR_NETWORK drives this value at build time. (#302)
  const [network, setNetwork] = useState<StellarNetwork>(APP_NETWORK);
  /**
   * The wallet's reported network state. Starts at APP_NETWORK because no
   * wallet has been queried yet; once a wallet is seen this can widen to
   * UNSUPPORTED/UNKNOWN, which gates transaction building. (#289)
   */
  const [networkStatus, setNetworkStatus] = useState<WalletNetworkState>(APP_NETWORK);
  const [walletNetworkName, setWalletNetworkName] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  /**
   * The wallet ID last selected by the user via the Stellar Wallets Kit modal.
   * Hydrated from the stored session on mount so the kit can restore the same
   * wallet module across page reloads. (#459)
   */
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  /**
   * `networkMismatch` is true when the network changed after the initial
   * connection was established. It's reset to false on:
   *   - disconnect (address becomes null)
   *   - explicit dismissal via dismissNetworkMismatch()
   */
  const [networkMismatch, setNetworkMismatch] = useState(false);
  /**
   * When the wallet's network last changed, so the UI can warn before a
   * mainnet action initiated shortly after a switch. null = no change yet.
   * (#480)
   */
  const [networkChangedAt, setNetworkChangedAt] = useState<number | null>(null);
  // Mirrors `networkChangedAt` as a boolean that clears itself after
  // RECENT_NETWORK_CHANGE_MS, so the provider value never has to call
  // Date.now() during render (react-hooks/purity). (#480)
  const [networkChangedRecently, setNetworkChangedRecently] = useState(false);
  const recentChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousNetworkStatusRef = useRef<WalletNetworkState>(APP_NETWORK);
  /**
   * The network that was active at connection time. Used to detect changes.
   * null means no connection has been established yet this session.
   */
  const initialNetworkRef = useRef<"PUBLIC" | "TESTNET" | null>(null);
  /** Whether the user has dismissed the mismatch banner for this session. */
  const dismissedRef = useRef(false);
  /**
   * Sticky record of the user having pressed Disconnect. The poller runs every
   * few seconds and would otherwise re-set the address straight back from
   * Freighter, silently undoing the disconnect. (#288)
   *
   * Backed by the persisted session (`@/lib/session`) so the decision also
   * survives a page reload; it is hydrated lazily by `isManuallyDisconnected`
   * below rather than in an initialiser, because reading storage during render
   * would diverge between the server and the client. (#343)
   */
  const manuallyDisconnectedRef = useRef<boolean | null>(null);

  /**
   * Connectivity tracking for the offline-aware UI. Defaults to "online" so SSR
   * and first paint never show a false offline state; the effect below corrects
   * it on mount and keeps it in sync with `online`/`offline` events. (#475)
   */
  const [isOnline, setIsOnline] = useState(true);
  const isOnlineRef = useRef(true);
  const [pendingOperations, setPendingOperations] = useState<QueuedOperation[]>([]);
  // Mirrors pendingOperations so event handlers always read the latest queue
  // without re-subscribing the window listeners on every enqueue.
  const pendingRef = useRef<QueuedOperation[]>([]);

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
      // If we're online, safe operations can run immediately; only offline
      // (or funding) keeps them in the queue.
      if (isOnlineRef.current && operation.kind === "safe" && operation.run) {
        void Promise.resolve(operation.run())
          .then(() => setPending((prev) => removeOperation(prev, id)))
          .catch((e) => {
            // Report through the central telemetry path; the operation stays
            // queued so it can be replayed when the connection is healthy. (#473)
            handleError(e, "wallet:enqueueOperation");
            /* leave queued if the immediate attempt fails */
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
      // Report the failure but keep the original semantics: the submission
      // aborts and the queue is left for the user to retry. (#473)
      handleError(e, "wallet:confirmFunding");
      throw e;
    }
    if (funding.length > 0) {
      setPending(removeOperations(pendingRef.current, funding.map((op) => op.id)));
    }
  }, [setPending]);

  // Initialise the Stellar Wallets Kit on mount, restoring the previously
  // selected wallet so the user does not have to re-choose after a reload. (#459)
  useEffect(() => {
    const session = loadSession();
    if (session.selectedWalletId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedWalletId(session.selectedWalletId);
    }
    void initWalletKit(session.selectedWalletId);
  }, []);

  // Connectivity awareness: keep `isOnline` in sync and replay safe operations
  // when the connection returns. (#475)
  useEffect(() => {    const sync = () => {
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

  /**
   * Reads the sticky disconnect flag, hydrating it from the stored session on
   * first use. Only the first call touches storage; every later call is a ref
   * read, so the 3–10s poll does no storage work.
   */
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

  /**
   * Applies a freshly-read wallet network. `network` (the endpoint target) is
   * only moved to networks the app supports; UNSUPPORTED/UNKNOWN are surfaced
   * through `networkStatus` so callers block rather than transact on a guess.
   */
  const applyNetwork = useCallback((status: WalletNetworkState, name: string | null) => {
    // Record the moment the active network changes so callers can warn on
    // mainnet actions initiated right after a switch (#480). Uses a ref
    // comparison rather than an updater so the timestamp write stays out of
    // the state updater.
    if (previousNetworkStatusRef.current !== status) {
      previousNetworkStatusRef.current = status;
      setNetworkChangedAt(Date.now());
      // Flag the change as recent for the mainnet-action warning window, and
      // clear it once the window elapses.
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
    // Shared by the "explicitly not connected" and "connection check threw"
    // paths below — a thrown error while checking connection is treated the
    // same as a clean disconnect, including clearing the (#480) network-change
    // tracking, rather than leaving stale connected state on screen.
    const resetToDisconnected = () => {
      setAddress(null);
      // Reset mismatch tracking when wallet disconnects.
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
      // Respect an explicit disconnect until the user reconnects, including one
      // made before the last reload. (#288, #343)
      if (isManuallyDisconnected()) return;

      const isConnected = await checkConnection();
      if (isConnected) {
        const pk = await getWalletAddress();
        const { status, name } = await getWalletNetwork();
        setAddress(pk);
        applyNetwork(status, name);

        // Mismatch tracking only makes sense between two supported networks; an
        // unsupported/unknown network gets its own, louder notice instead.
        if (!isSupportedNetwork(status)) return;

        if (initialNetworkRef.current === null) {
          // First time we see the wallet connected — record the baseline network.
          initialNetworkRef.current = status;
        } else if (!dismissedRef.current && status !== initialNetworkRef.current) {
          // Network changed after initial connection → surface warning.
          setNetworkMismatch(true);
          // Update the baseline so subsequent same-network polls don't re-fire,
          // but a *further* change will fire again.
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
      // Re-read the wallet so address/network state reflects the outcome;
      // applyNetwork records the change (if any) for the mainnet warning.
      await updateConnection();
      return result;
    },
    [updateConnection]
  );

  const connect = useCallback(async () => {
    // An explicit connect clears the sticky disconnect so polling resumes. (#288)
    manuallyDisconnectedRef.current = false;
    setIsConnecting(true);
    try {
      // Open the Stellar Wallets Kit modal so the user can choose any supported
      // wallet (Freighter, xBull, Lobstr, Albedo, Rabet, etc.). (#459)
      const result = await openWalletSelectionModal();
      if (result) {
        const { address: pk, walletId } = result;
        // Persist the cleared flag only once a wallet actually answered, so a
        // cancelled prompt leaves an earlier disconnect in place.
        markConnected(pk, Date.now(), walletId);
        setAddress(pk);
        setSelectedWalletId(walletId);
        const { status, name } = await getWalletNetwork();
        applyNetwork(status, name);
        // Record the network at the point of explicit connection so we can
        // detect changes later in the polling loop.
        initialNetworkRef.current = isSupportedNetwork(status) ? status : null;
        dismissedRef.current = false;
        setNetworkMismatch(false);
      } else {
        // User dismissed the modal: leave the stored session decision in force
        // instead of letting a cancelled attempt count as a reconnect.
        manuallyDisconnectedRef.current = loadSession().manuallyDisconnected;
      }
    } catch (e) {
      // Report the failure, then rethrow so the caller (and the boundary that
      // wraps this tree) can also react to it. (#473)
      handleError(e, "wallet:connect");
      throw e;
    } finally {
      setIsConnecting(false);
    }
  }, [applyNetwork]);

  const disconnect = useCallback(() => {
    manuallyDisconnectedRef.current = true;
    // Persist so the connection poller does not re-adopt the wallet after a
    // reload. Lapses after SESSION_TTL_MS. (#343)
    markDisconnected(address);
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
  }, [address]);

  // Polling with backoff + visibility awareness
  useEffect(() => {
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
        // reschedule immediately so the next tick uses the slower interval
        scheduleNext();
      }, BACKOFF_THRESHOLD_MS);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden: pause all polling
        clearAllTimers();
      } else {
        // Tab visible again: reset to fast interval, check immediately,
        // then start the backoff timer fresh.
        isFast = true;
        updateConnection().finally(() => {
          startBackoff();
          scheduleNext();
        });
      }
    };

    // Initial check + start fast polling
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updateConnection().finally(() => {
      startBackoff();
      scheduleNext();
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
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
        // openWalletModal is an alias for connect that makes the modal intent
        // explicit for components that want a "Change wallet" button. (#459)
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