import { useEffect, useState, useCallback, useRef } from 'react';
import { getHealthStatus, type HealthStatus } from '@/lib/api';

/**
 * Hook to poll the API health status (#498).
 *
 * Returns the latest health status and polling state.
 * Automatically stops polling when the component unmounts.
 * Polling is paused while the tab is hidden and refreshed on visibility (#712).
 */

interface UseHealthStatusOptions {
  pollInterval?: number;
  initialDelay?: number;
  retainTime?: number;
}

const DEFAULT_POLL_INTERVAL = 30000; // 30 seconds
const DEFAULT_INITIAL_DELAY = 2000; // Start polling after 2 seconds
const DEFAULT_RETAIN_TIME = 5000; // Keep degraded status for 5 seconds after recovery

/**
 * Sentinel status used when the health endpoint is completely unreachable.
 * A total outage must surface the banner just like a partial one (#710).
 */
const UNREACHABLE_STATUS: HealthStatus = {
  status: 'unhealthy',
  message: 'Service unreachable',
};

export function useHealthStatus(options: UseHealthStatusOptions = {}) {
  const {
    pollInterval = DEFAULT_POLL_INTERVAL,
    initialDelay = DEFAULT_INITIAL_DELAY,
    retainTime = DEFAULT_RETAIN_TIME,
  } = options;

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isDegraded, setIsDegraded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retainTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialDelayRef = useRef<NodeJS.Timeout | null>(null);

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
    setIsLoading(true);
    try {
      const status = await getHealthStatus();
      setHealth(status);
      setError(null);

      // Only show degraded banner if service is actually degraded
      if (status && (status.status === 'degraded' || status.status === 'unhealthy')) {
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
        // Still unreachable after the retry: treat as a total outage.
        setHealth(UNREACHABLE_STATUS);
        setIsDegraded(true);
        if (retainTimeoutRef.current) {
          clearTimeout(retainTimeoutRef.current);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [retainTime]);

  useEffect(() => {
    const startPolling = () => {
      if (pollIntervalRef.current) {
        return;
      }
      pollIntervalRef.current = setInterval(checkHealth, pollInterval);
    };

    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Pause polling while the tab is hidden (#712).
        stopPolling();
      } else {
        // Refresh immediately when the tab becomes visible again (#712).
        checkHealth();
        startPolling();
      }
    };

    // Start polling after initial delay
    initialDelayRef.current = setTimeout(() => {
      checkHealth();

      // Then poll at regular intervals, unless the tab is already hidden
      if (document.visibilityState !== 'hidden') {
        startPolling();
      }
    }, initialDelay);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (initialDelayRef.current) {
        clearTimeout(initialDelayRef.current);
      }
      stopPolling();
      if (retainTimeoutRef.current) {
        clearTimeout(retainTimeoutRef.current);
      }
    };
  }, [checkHealth, pollInterval, initialDelay]);

  return {
    health,
    isDegraded,
    isLoading,
    error,
    refetch: checkHealth,
  };
}
