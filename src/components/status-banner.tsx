'use client';

import { AlertCircle, X } from 'lucide-react';
import { useState } from 'react';
import { useHealthStatus } from '@/hooks/useHealthStatus';
import { getStatusMessage } from '@/lib/api';

/**
 * Status banner component for showing service health (#498).
 *
 * Displays a banner when the service is degraded or unhealthy.
 * Automatically dismisses after recovery and requires 5+ seconds of stable
 * health to clear (avoids flashing transient blips).
 */

export function StatusBanner() {
  const { health, isDegraded } = useHealthStatus();
  const [dismissed, setDismissed] = useState(false);

  const isVisible = isDegraded && !dismissed;

  if (!isVisible) {
    return null;
  }

  const message = getStatusMessage(health);
  const severity = health?.status === 'unhealthy' ? 'error' : 'warning';

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-40 border-b ${
        severity === 'error'
          ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
          : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
      }`}
      role="alert"
      aria-live="polite"
      aria-label="Service status"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {severity === 'error' ? (
            <AlertCircle className={`w-5 h-5 flex-shrink-0 text-red-600 dark:text-red-400`} />
          ) : (
            <AlertCircle className={`w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400`} />
          )}
          <div className={severity === 'error' ? 'text-red-800 dark:text-red-200' : 'text-amber-800 dark:text-amber-200'}>
            <p className="text-sm font-medium">
              {severity === 'error' ? 'Service Unavailable' : 'Service Degradation'}
            </p>
            {message && <p className="text-xs mt-0.5">{message}</p>}
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className={`flex-shrink-0 ml-4 inline-flex ${
            severity === 'error'
              ? 'text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900'
              : 'text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900'
          } rounded p-1 transition-colors`}
          aria-label="Dismiss status banner"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
