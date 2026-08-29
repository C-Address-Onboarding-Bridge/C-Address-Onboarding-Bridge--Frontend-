"use client";

import { useState, useRef, useEffect } from "react";
import { useFeatureFlags } from "@/contexts/FeatureFlagContext";

/**
 * Developer panel for toggling feature flags in development mode.
 * Only renders when NODE_ENV is 'development'.
 *
 * ## Accessibility & Dev-Only Keyboard / Focus Flow:
 * 1. **Trigger Button**:
 *    - Located at fixed position bottom-right (`fixed bottom-4 right-4`).
 *    - Fully keyboard accessible via `Tab` key with visible focus indicator (`focus-visible:ring-2`).
 *    - Exposes `aria-expanded` state indicating whether the panel is currently open.
 *    - Toggled via `Space` or `Enter` key presses.
 *
 * 2. **Dialog Container**:
 *    - Formatted as an accessible modal dialog with `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="feature-flags-title"`.
 *    - When opened, focus is automatically shifted into the panel container so screen readers announce dialog entry.
 *
 * 3. **Keyboard Controls & Navigation**:
 *    - **Escape Key (`Escape`)**: Pressing `Escape` at any time while the panel is open closes the panel immediately and returns keyboard focus to the toggle button.
 *    - **Tab Navigation (`Tab` / `Shift+Tab`)**: Focus moves sequentially between feature flag toggle switches (`role="switch"`) and reset buttons (`title="Reset to default"`), and is trapped within the dialog — tabbing past the last focusable element wraps to the first, and shift+tabbing past the first wraps to the last.
 *    - **Focus Restoration**: Closing the panel via mouse click or `Escape` key restores active focus back to the floating trigger button (`toggleButtonRef`).
 *
 * 4. **ARIA Standards**:
 *    - Feature flag toggles use `role="switch"` and `aria-checked={enabled}` with explicit `aria-label`.
 *    - Reset buttons use `aria-label={`Reset ${flag.name} to default`}`.
 */
export function FeatureFlagPanel() {
   const { flags, devOverrides, isEnabled, setOverride, clearOverride } = useFeatureFlags();
  const [isOpen, setIsOpen] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleToggleOpen = () => setIsOpen((open) => !open);

  useEffect(() => {
    if (!isOpen) return;

    panelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        toggleButtonRef.current?.focus();
        return;
      }

      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Restricted to development, or to an explicitly authorised operator in
  // production: NEXT_PUBLIC_FLAG_PANEL_TOKEN must be set and match a token
  // the operator has stored in this browser's localStorage. Flags can
  // control in-development or sensitive features, so the panel to flip them
  // is not shipped open to every visitor. (#490)
  const isAuthorisedInProd =
    typeof window !== "undefined" &&
    !!process.env.NEXT_PUBLIC_FLAG_PANEL_TOKEN &&
    window.localStorage.getItem("ff_panel_token") === process.env.NEXT_PUBLIC_FLAG_PANEL_TOKEN;

  if (process.env.NODE_ENV !== "development" && !isAuthorisedInProd) return null;


  return (
    <>
      {/* Toggle button — fixed bottom-right */}
      <button
        ref={toggleButtonRef}
        onClick={handleToggleOpen}
        className="fixed bottom-4 right-4 z-50 bg-gray-800 text-white
          text-xs px-3 py-2 rounded-full shadow-lg hover:bg-gray-700
          focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
        aria-label="Toggle feature flags panel"
        aria-expanded={isOpen}
      >
        🚩 Flags
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feature-flags-title"
          className="fixed bottom-16 right-4 z-50 w-80 bg-white dark:bg-gray-900
            border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl
            overflow-hidden focus:outline-none"
        >
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <h2 id="feature-flags-title" className="text-sm font-semibold text-gray-900 dark:text-white">
              Feature Flags
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Dev overrides only — not persisted to server
            </p>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto">
            {flags.map((flag) => {
              const hasOverride = flag.key in devOverrides;
              const enabled = isEnabled(flag.key);
              return (
                <li key={flag.key} className="p-3 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                      {flag.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {flag.description}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Rollout: {flag.rolloutPercentage}%
                      {hasOverride && (
                        <span className="ml-2 text-amber-500 font-semibold">
                          ⚠ Overridden
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setOverride(flag.key, !enabled)}
                      className={`relative inline-flex h-5 w-9 rounded-full transition-colors
                        ${enabled ? "bg-green-500" : "bg-gray-300"}
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500`}
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`Toggle ${flag.name}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white
                          shadow transform transition-transform
                          ${enabled ? "translate-x-4" : "translate-x-0.5"}`}
                      />
                    </button>
                    {hasOverride && (
                      <button
                        onClick={() => clearOverride(flag.key)}
                        className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 px-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                        aria-label={`Reset ${flag.name} to default`}
                        title="Reset to default"
                      >
                        ↩
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
