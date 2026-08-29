"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useTelemetry } from "@/contexts/TelemetryContext";
import { TELEMETRY_INFO } from "@/lib/telemetry";

export function TelemetryConsentPrompt() {
  const { consent, setConsent, isFirstVisit } = useTelemetry();
  const [isVisible, setIsVisible] = useState(isFirstVisit && consent === "pending");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsVisible(isFirstVisit && consent === "pending");
  }, [isFirstVisit, consent]);

  const handleAccept = () => {
    setConsent("granted");
    setIsVisible(false);
  };

  const handleDecline = () => {
    setConsent("denied");
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-6 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              Help us improve your experience
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              We&rsquo;d like to collect data to make the bridge better for you
            </p>
          </div>
          <button
            onClick={() => handleDecline()}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* What We Collect */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">What we collect</h3>
            <ul className="space-y-2">
              {TELEMETRY_INFO.events.map((event) => (
                <li key={event} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                  <span>{event}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Why We Collect */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Why we collect it</h3>
            <ul className="space-y-2">
              {TELEMETRY_INFO.purposes.map((purpose) => (
                <li key={purpose} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                  <span>{purpose}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Privacy Info */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <p>
                <span className="font-semibold">Data retention:</span> {TELEMETRY_INFO.retention}
              </p>
              <p>
                <span className="font-semibold">Your privacy:</span> No personally identifiable information (PII) is collected. You can review our privacy policy for more details.
              </p>
              <p>
                <span className="font-semibold">Control:</span> {TELEMETRY_INFO.optOut}
              </p>
            </div>
          </div>

          {/* Expandable Section */}
          <details className="group">
            <summary className="cursor-pointer font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Show detailed information
            </summary>
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800 space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <p>
                This telemetry system helps us understand user behavior and identify issues without compromising your privacy. No financial data, wallet addresses, or transaction details are collected.
              </p>
              <p>
                All data is processed securely and only used for the stated purposes. You can opt out at any time from your profile settings, and we will immediately stop collecting new data.
              </p>
            </div>
          </details>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-6 flex gap-3">
          <button
            onClick={handleDecline}
            className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg font-medium transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
