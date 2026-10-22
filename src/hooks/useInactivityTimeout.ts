import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  recordActivity,
  getInactivityState,
  extendSession,
  markReauthRequired,
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

  // Explicit re-confirmation (e.g. "I'm still here" or a wallet re-sign)
  // extends the session. This is a plain callback, not something invoked
  // from inside a setState updater: resetTimeout/extendSession have side
  // effects (timers, localStorage) and React requires updaters to be pure,
  // which StrictMode's double-invocation would otherwise violate.
  const extend = useCallback(() => {
    extendSession();
    setInactivityState((prev) =>
      prev
        ? { ...prev, isWarning: false, reauthRequired: false }
        : { lastActivityAt: Date.now(), isTimedOut: false, isWarning: false, reauthRequired: false }
    );
    resetTimeout();
  }, [resetTimeout]);

  // onWarning/onTimeout are held in refs so the mount effect below can have
  // a stable, empty-ish dependency list: callers frequently pass inline
  // arrow functions, and depending on them directly would re-run the effect
  // (and its teardown) on every render.
  const onWarningRef = useRef(onWarning);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onWarningRef.current = onWarning;
    onTimeoutRef.current = onTimeout;
  }, [onWarning, onTimeout]);

  // Only clears the timers; it intentionally leaves persisted storage alone
  // (REAUTH_REQUIRED_KEY in particular) so an unmount/remount - e.g. a page
  // reload - doesn't silently drop a pending re-auth requirement.
  const clearTimeout_ = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    setInactivityState(null);
  };

  const lastThrottledAtRef = useRef(0);

  useEffect(() => {
    // Initialize inactivity state without calling setState in effect, and
    // without recording "activity" just because the component mounted -
    // doing so on every mount/reload would mask a real timeout (see
    // getInactivityState, which now also honours the persisted
    // REAUTH_REQUIRED_KEY flag for this reason).
    const now = Date.now();
    const initialState = getInactivityState(now, timeoutMs);
    const msUntilWarning = Math.max(0, initialState.lastActivityAt + (timeoutMs - 60_000) - now);
    const msUntilTimeout = Math.max(0, initialState.lastActivityAt + timeoutMs - now);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    const scheduleWarning = (delay: number) => {
      warningRef.current = setTimeout(() => {
        setInactivityState((prev) => ({
          ...(prev || initialState),
          isWarning: true,
        }));
        onWarningRef.current?.();
      }, delay);
    };

    const scheduleTimeout = (delay: number) => {
      timeoutRef.current = setTimeout(() => {
        markReauthRequired();
        clearSensitiveState();
        setInactivityState((prev) => ({
          ...(prev || initialState),
          isTimedOut: true,
          reauthRequired: true,
        }));
        onTimeoutRef.current?.();
      }, delay);
    };

    scheduleWarning(msUntilWarning);
    scheduleTimeout(msUntilTimeout);

    // Ordinary activity (clicking, typing, scrolling) should reset the
    // timer, not just dismiss an already-visible warning. It's throttled so
    // a flurry of mousemove/scroll events doesn't thrash localStorage and
    // setTimeout on every frame.
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastThrottledAtRef.current < 1_000) return;
      lastThrottledAtRef.current = now;

      recordActivity(now);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
      scheduleWarning(timeoutMs - 60_000);
      scheduleTimeout(timeoutMs);

      setInactivityState((prev) =>
        prev && (prev.isWarning || prev.isTimedOut)
          ? { ...prev, isWarning: false, isTimedOut: false, lastActivityAt: now }
          : prev
      );
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
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
    // Mount once: onWarning/onTimeout are read via refs above precisely so
    // inline callbacks don't force a re-run (which previously wiped
    // localStorage state via clearTimeout_ on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMs]);

  return {
    inactivityState,
    extend,
    clearTimeout: clearTimeout_,
  };
}
