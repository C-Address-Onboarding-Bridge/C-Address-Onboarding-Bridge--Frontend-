import { useEffect, useState } from 'react';

/**
 * Hook that delays the loading state to avoid flashing skeletons on fast loads.
 *
 * @param isLoading - The original loading state.
 * @param delayMs - Delay in milliseconds before showing the loading indicator. Default is 200ms.
 * @returns A boolean indicating whether the delayed loading state should be shown.
 */
export function useDelayedLoading(isLoading: boolean, delayMs = 200): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      // If not loading, immediately clear delayed state
      setDelayed(false);
      return;
    }

    const timer = setTimeout(() => {
      setDelayed(true);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [isLoading, delayMs]);

  return delayed;
}
