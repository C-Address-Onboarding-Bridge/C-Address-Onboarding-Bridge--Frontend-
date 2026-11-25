import { useEffect, useState, useCallback, useRef } from 'react';
import { getHealthStatus, unreachableHealthStatus, type HealthStatus } from '@/lib/api';

const POLL_INTERVAL = 30_000;
const INITIAL_DELAY = 2_000;
const RETAIN_TIME = 5_000;

interface UseHealthStatusOptions {
  pollInterval?: number;
  initialDelay?: number;
  retainTime?: number;
}

const DEFAULT_POLL_INTERVAL = 30000; // 30 seconds
const DEFAULT_INITIAL_DELAY = 2000; // Start polling after 2 seconds
const DEFAULT_RETAIN_TIME = 5000; // Keep degraded status for 5 seconds after recovery

export function useHealthStatus(options: UseHealthStatusOptions = {}) {
  const {
    pollInterval = DEFAULT_POLL_INTERVAL,
    initialDelay = DEFAULT_INITIAL_DELAY,
    retainTime = DEFAULT_RETAIN_TIME,
  } = options;

export function useHealthStatus(
  pollInterval: number = POLL_INTERVAL,
  initialDelay: number = INITIAL_DELAY,
  retainTime: number = RETAIN_TIME,
): UseHealthStatusResult {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [isDegraded, setIsDegraded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDegradedRef = useRef(false);
  const retainTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // checkHealth reads the latest isDegraded through a ref rather than closing
  // over it (#753). With isDegraded in its dependencies, every degraded/healthy
  // transition recreated checkHealth, which re-ran the polling effect below:
  // polling restarted on initialDelay instead of keeping pollInterval, and the
  // retain window was cut short by that extra early poll.
  const isDegradedRef = useRef(isDegraded);
  useEffect(() => {
    isDegradedRef.current = isDegraded;
  }, [isDegraded]);
  // True once a healthy poll has started the retain window, until it ends or
  // a degraded/failed check cancels it. Later healthy polls inside the window
  // must not restart it, or a poll interval shorter than retainTime would
  // keep the banner up forever.
  const recoveringRef = useRef(false);

  const checkHealth = useCallback(async () => {
    try {
      const result = await getHealthStatus();
      setStatus(result);
      setError(null);

      if (result.status === 'unhealthy') {
        if (retainTimeoutRef.current) {
          clearTimeout(retainTimeoutRef.current);
          retainTimeoutRef.current = null;
        }
        isDegradedRef.current = true;
        setIsDegraded(true);
        recoveringRef.current = false;

        // Clear any existing timeout
        if (retainTimeoutRef.current) {
          clearTimeout(retainTimeoutRef.current);
        }
      } else if (isDegradedRef.current && !recoveringRef.current) {
        // Keep the degraded banner visible for retainTime after the first
        // healthy result, to avoid flashing.
        recoveringRef.current = true;
        if (retainTimeoutRef.current) {
          clearTimeout(retainTimeoutRef.current);
        }
        retainTimeoutRef.current = setTimeout(() => {
          recoveringRef.current = false;
          setIsDegraded(false);
        }, retainTime);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      // A failed check ends any recovery in progress; a healthy retry below
      // starts a fresh window on the next healthy poll.
      recoveringRef.current = false;

      // A null result means the health endpoint was unreachable. Retry once
      // before declaring a total outage so a transient blip doesn't flash
      // the banner (#710).
      let status: HealthStatus | null = null;
      try {
        status = await getHealthStatus();
      } catch {
        status = null;
      }

      if (status) {
        setHealth(status);
        if (status.status === 'degraded' || status.status === 'unhealthy') {
          setIsDegraded(true);
          if (retainTimeoutRef.current) {
            clearTimeout(retainTimeoutRef.current);
          }
        }
      } else {
        // Still unreachable after the retry: treat as a total outage (#710).
        // Same full-shape fallback as getHealthStatus (#842).
        setHealth(unreachableHealthStatus());
        setIsDegraded(true);
        if (retainTimeoutRef.current) {
          clearTimeout(retainTimeoutRef.current);
        }
      }
      isDegradedRef.current = true;
      setIsDegraded(true);
    } finally {
      setIsLoading(false);
    }
  }, [retainTime]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        void checkHealth();
      }, pollInterval);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkHealth();
        startPolling();
      } else {
        stopPolling();
      }
    };

    initialDelayRef.current = setTimeout(() => {
      initialDelayRef.current = null;
      void checkHealth();
      if (document.visibilityState === 'visible') {
        startPolling();
      }
    }, initialDelay);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
      if (initialDelayRef.current) {
        clearTimeout(initialDelayRef.current);
        initialDelayRef.current = null;
      }
      if (retainTimeoutRef.current) {
        clearTimeout(retainTimeoutRef.current);
        retainTimeoutRef.current = null;
      }
    };
  }, [checkHealth, pollInterval, initialDelay]);

  return { status, isDegraded, isLoading, error, refresh: checkHealth };
}
