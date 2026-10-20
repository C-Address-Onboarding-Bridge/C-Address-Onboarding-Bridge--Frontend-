import { useCallback, useEffect, useRef, useState } from 'react';
import { getHealthStatus, HealthStatus } from '../lib/api';

const POLL_INTERVAL = 30_000;
const INITIAL_DELAY = 2_000;
const RETAIN_TIME = 5_000;

const UNREACHABLE_STATUS: HealthStatus = {
  status: 'unhealthy',
  timestamp: new Date().toISOString(),
  services: {},
  circuitBreakers: {},
  message: 'Service unreachable',
};

export interface UseHealthStatusResult {
  status: HealthStatus | null;
  isDegraded: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

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
      } else if (isDegradedRef.current) {
        if (retainTimeoutRef.current) {
          clearTimeout(retainTimeoutRef.current);
        }
        retainTimeoutRef.current = setTimeout(() => {
          retainTimeoutRef.current = null;
          isDegradedRef.current = false;
          setIsDegraded(false);
        }, retainTime);
      }
    } catch (err) {
      setStatus(UNREACHABLE_STATUS);
      setError(err instanceof Error ? err.message : 'Service unreachable');
      if (retainTimeoutRef.current) {
        clearTimeout(retainTimeoutRef.current);
        retainTimeoutRef.current = null;
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
