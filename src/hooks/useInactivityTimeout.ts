import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  recordActivity,
  getInactivityState,
  extendSession,
  markReauthRequired,
  clearInactivityState,
  clearSensitiveState,
  INACTIVITY_TIMEOUT_MS,
  type InactivityState,
} from "@/lib/inactivityTimeout";
import { useHydrated } from "@/hooks/useHydrated";

interface UseInactivityTimeoutOptions {
  timeoutMs?: number;
  onWarning?: () => void;
  onTimeout?: () => void;
}

export function useInactivityTimeout(options: UseInactivityTimeoutOptions = {}) {
  const { timeoutMs = INACTIVITY_TIMEOUT_MS, onWarning, onTimeout } = options;
  const hydrated = useHydrated();
  const [initialSnapshot] = useState<InactivityState | null>(() =>
    typeof window === "undefined" ? null : getInactivityState(Date.now(), timeoutMs)
  );
  const [stateOverride, setStateOverride] = useState<InactivityState | null | undefined>(undefined);
  const inactivityState = stateOverride !== undefined
    ? stateOverride
    : hydrated ? initialSnapshot : null;
  const setInactivityState = useCallback<Dispatch<SetStateAction<InactivityState | null>>>(
    (next) => setStateOverride((previous) =>
      typeof next === "function" ? next(previous ?? null) : next
    ),
    [],
  );
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimeout = useCallback(
    (now?: number) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);

      recordActivity(now);

      // Warn 1 minute before timeout
      warningRef.current = setTimeout(
        () => {
          setInactivityState((prev) =>
            prev ? { ...prev, isWarning: true } : getInactivityState(Date.now(), timeoutMs)
          );
          onWarning?.();
        },
        timeoutMs - 60_000
      );

      // Timeout after full duration
      timeoutRef.current = setTimeout(
        () => {
          markReauthRequired();
          clearSensitiveState();
          setInactivityState((prev) =>
            prev
              ? { ...prev, isTimedOut: true, reauthRequired: true }
              : getInactivityState(Date.now(), timeoutMs)
          );
          onTimeout?.();
        },
        timeoutMs
      );
    },
    [timeoutMs, onWarning, onTimeout]
  );

  const extend = useCallback(() => {
    extendSession();
    setInactivityState((prev) =>
      prev
        ? { ...prev, isWarning: false, reauthRequired: false }
        : { lastActivityAt: Date.now(), isTimedOut: false, isWarning: false, reauthRequired: false }
    );
    resetTimeout();
  }, [resetTimeout]);

  const clearTimeout_ = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    clearInactivityState();
    setInactivityState(null);
  };

  useEffect(() => {
    // Initialize inactivity state without calling setState in effect
    const now = Date.now();
    const initialState = getInactivityState(now, timeoutMs);

    // Reset timeout timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    recordActivity(now);

    // Warn 1 minute before timeout
    warningRef.current = setTimeout(
      () => {
        setInactivityState((prev) => ({
          ...(prev || initialState),
          isWarning: true,
        }));
        onWarning?.();
      },
      timeoutMs - 60_000
    );

    // Timeout after full duration
    timeoutRef.current = setTimeout(
      () => {
        markReauthRequired();
        clearSensitiveState();
        setInactivityState((prev) => ({
          ...(prev || initialState),
          isTimedOut: true,
          reauthRequired: true,
        }));
        onTimeout?.();
      },
      timeoutMs
    );

    const handleActivity = () => {
      setInactivityState((prev) => {
        if (prev?.isWarning) {
          extend();
        }
        return prev;
      });
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("click", handleActivity);
    window.addEventListener("scroll", handleActivity);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      clearTimeout_();
    };
  }, [timeoutMs, onWarning, onTimeout, extend]);

  return {
    inactivityState,
    extend,
    clearTimeout: clearTimeout_,
  };
}
