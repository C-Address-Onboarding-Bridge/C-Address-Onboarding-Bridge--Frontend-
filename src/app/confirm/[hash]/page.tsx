"use client";

import { useState, useEffect } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { isValidHash, toPublicConfirmation, getConfirmationUrl, type TransactionConfirmation, type PublicConfirmation } from "@/lib/confirmations";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

interface ConfirmationPageProps {
  params: {
    hash: string;
  };
}

async function fetchConfirmation(hash: string): Promise<TransactionConfirmation | null> {
  try {
    // In a real application, this would fetch from the API
    // For now, return null to trigger the not-found state
    const response = await fetch(`/api/confirmations/${hash}`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export default function ConfirmationPage({ params }: ConfirmationPageProps) {
  const { hash } = params;
  const [confirmation, setConfirmation] = useState<PublicConfirmation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { status, copy } = useCopyToClipboard();

  useEffect(() => {
    async function load() {
      if (!isValidHash(hash)) {
        setError("Invalid transaction hash format");
        setIsLoading(false);
        return;
      }

      const data = await fetchConfirmation(hash);
      if (!data) {
        setError("Transaction not found");
        setIsLoading(false);
        return;
      }

      setConfirmation(toPublicConfirmation(data));
      setIsLoading(false);
    }

    load();
  }, [hash]);

  const handleCopyLink = () => {
    const url = getConfirmationUrl(hash);
    copy(url);
  };

  const handleNativeShare = async () => {
    if (!navigator.share) {
      handleCopyLink();
      return;
    }

    try {
      await navigator.share({
        title: `Transaction Confirmed: ${confirmation?.amount} ${confirmation?.asset}`,
        text: `Check out my transaction confirmation: ${confirmation?.amount} ${confirmation?.asset}`,
        url: window.location.href,
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Share failed:", err);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg text-gray-600 dark:text-gray-400">Loading transaction...</div>
      </div>
    );
  }

  if (error || !confirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-600 mb-2">Transaction Not Found</h1>
          <p className="text-gray-600 dark:text-gray-400">{error || "The transaction you are looking for does not exist."}</p>
        </div>
      </div>
    );
  }

  const statusColor = {
    success: "text-green-600 dark:text-green-400",
    pending: "text-yellow-600 dark:text-yellow-400",
    failed: "text-red-600 dark:text-red-400",
  };

  const statusBg = {
    success: "bg-green-50 dark:bg-green-900/20",
    pending: "bg-yellow-50 dark:bg-yellow-900/20",
    failed: "bg-red-50 dark:bg-red-900/20",
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className={`inline-block px-4 py-2 rounded-full ${statusBg[confirmation.status]} mb-4`}>
              <span className={`font-semibold ${statusColor[confirmation.status]}`}>
                {confirmation.status.charAt(0).toUpperCase() + confirmation.status.slice(1)}
              </span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              {confirmation.amount} {confirmation.asset}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">Transaction confirmed</p>
          </div>

          {/* Details */}
          <div className="space-y-6 mb-8">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">From</p>
                <p className="font-mono text-sm text-gray-900 dark:text-white">{confirmation.fromAddressTruncated}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">To</p>
                <p className="font-mono text-sm text-gray-900 dark:text-white">{confirmation.toAddressTruncated}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Fee</p>
                <p className="font-mono text-sm text-gray-900 dark:text-white">{confirmation.fee}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Date & Time</p>
                <p className="text-sm text-gray-900 dark:text-white">
                  {new Date(confirmation.timestamp).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                  <br />
                  {new Date(confirmation.timestamp).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Transaction Hash</p>
              <p className="font-mono text-xs text-gray-600 dark:text-gray-500 break-all">{confirmation.hash}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleCopyLink}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              {status === "copied" ? <Check size={18} /> : <Copy size={18} />}
              {status === "copied" ? "Copied" : status === "error" ? "Copy failed" : "Copy Link"}
            </button>
            <button
              onClick={handleNativeShare}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <Share2 size={18} />
              Share
            </button>
          </div>

          {/* Info Text */}
          <p className="text-xs text-gray-500 dark:text-gray-500 text-center mt-6">
            This confirmation page displays only public information visible on the blockchain. No private keys or sensitive data are shown.
          </p>
        </div>
      </div>
    </div>
  );
}
