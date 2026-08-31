import { useEffect, useState, useCallback, useRef } from 'react';
import { getHealthStatus, type HealthStatus } from '@/lib/api';

/**
 * Hook to poll the API health status (#498).
 *
 * Returns the latest health status and polling state.
 * Automatically stops polling when the component unmounts.
 */

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

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isDegraded, setIsDegraded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retainTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialDelayRef = useRef<NodeJS.Timeout | null>(null);

  const checkHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = await getHealthStatus();
      setHealth(status);
      setError(null);

      // Only show degraded banner if service is actually degraded
      if (status && (status.status === 'degraded' || status.status === 'unhealthy')) {
        setIsDegraded(true);

        // Clear any existing timeout
        if (retainTimeoutRef.current) {
          clearTimeout(retainTimeoutRef.current);
        }
      } else if (isDegraded) {
        // Keep the degraded banner visible for retainTime to avoid flashing
        retainTimeoutRef.current = setTimeout(() => {
          setIsDegraded(false);
        }, retainTime);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      // On fetch error, treat as potential service issue
      setIsDegraded(true);
    } finally {
      setIsLoading(false);
    }
  }, [isDegraded, retainTime]);

  useEffect(() => {
    // Start polling after initial delay
    initialDelayRef.current = setTimeout(() => {
      checkHealth();

      // Then poll at regular intervals
      pollIntervalRef.current = setInterval(checkHealth, pollInterval);
    }, initialDelay);

    return () => {
      if (initialDelayRef.current) {
        clearTimeout(initialDelayRef.current);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
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
