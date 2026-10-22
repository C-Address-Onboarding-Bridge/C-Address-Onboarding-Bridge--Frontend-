'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ReceiptParty {
  label: string;
  address: string;
}

interface Receipt {
  hash: string;
  amount: string;
  fee: string;
  net: string;
  asset: string;
  from: ReceiptParty;
  to: ReceiptParty;
  timestamp: string;
  signature?: string;
  signatureVerified?: boolean;
}

function formatAmount(value: string, asset: string): string {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return `${value} ${asset}`;
  }
  return `${numeric.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${asset}`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export default function ReceiptPage() {
  const params = useParams<{ hash: string }>();
  const hash = typeof params?.hash === 'string' ? params.hash : '';

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hash) {
      setLoading(false);
      setNotFound(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setError(null);

    fetch(`/api/receipts/${encodeURIComponent(hash)}`)
      .then(async (response) => {
        if (response.status === 404) {
          if (!cancelled) {
            setNotFound(true);
          }
          return null;
        }
        if (!response.ok) {
          throw new Error(`Failed to load receipt (${response.status})`);
        }
        return (await response.json()) as Receipt;
      })
      .then((data) => {
        if (!cancelled && data) {
          setReceipt(data);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load receipt');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hash]);

  const handleDownload = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-gray-500">Loading receipt…</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold text-gray-900">Receipt not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          No receipt exists for transaction hash <span className="font-mono">{hash || 'unknown'}</span>.
        </p>
        <Link href="/bridge" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Back to bridge
        </Link>
      </main>
    );
  }

  if (error || !receipt) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold text-gray-900">Unable to load receipt</h1>
        <p className="mt-2 text-sm text-gray-600">{error ?? 'An unexpected error occurred.'}</p>
        <Link href="/bridge" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Back to bridge
        </Link>
      </main>
    );
  }

  return (
    <main className="receipt mx-auto max-w-2xl px-4 py-10">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .receipt { max-width: 100%; padding: 0; }
          body { background: #fff; }
        }
      `}</style>

      <div className="flex items-center justify-between no-print">
        <h1 className="text-xl font-semibold text-gray-900">Transaction receipt</h1>
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Download PDF
        </button>
      </div>

      <dl className="mt-6 divide-y divide-gray-200 rounded-lg border border-gray-200">
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm text-gray-500">Amount</dt>
          <dd className="text-sm font-medium text-gray-900">{formatAmount(receipt.amount, receipt.asset)}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm text-gray-500">Fee</dt>
          <dd className="text-sm font-medium text-gray-900">{formatAmount(receipt.fee, receipt.asset)}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm text-gray-500">Net</dt>
          <dd className="text-sm font-medium text-gray-900">{formatAmount(receipt.net, receipt.asset)}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm text-gray-500">Asset</dt>
          <dd className="text-sm font-medium text-gray-900">{receipt.asset}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm text-gray-500">From</dt>
          <dd className="text-sm font-medium text-gray-900">
            {receipt.from.label} <span className="font-mono text-xs text-gray-500">{receipt.from.address}</span>
          </dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm text-gray-500">To</dt>
          <dd className="text-sm font-medium text-gray-900">
            {receipt.to.label} <span className="font-mono text-xs text-gray-500">{receipt.to.address}</span>
          </dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm text-gray-500">Timestamp</dt>
          <dd className="text-sm font-medium text-gray-900">{formatTimestamp(receipt.timestamp)}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm text-gray-500">Transaction hash</dt>
          <dd className="break-all font-mono text-xs text-gray-900">{receipt.hash}</dd>
        </div>
        {typeof receipt.signatureVerified === 'boolean' && (
          <div className="flex justify-between px-4 py-3">
            <dt className="text-sm text-gray-500">Signature</dt>
            <dd className={`text-sm font-medium ${receipt.signatureVerified ? 'text-green-600' : 'text-red-600'}`}>
              {receipt.signatureVerified ? 'Verified' : 'Not verified'}
            </dd>
          </div>
        )}
      </dl>

      <Link href="/bridge" className="mt-6 inline-block text-sm text-blue-600 hover:underline no-print">
        Back to bridge
      </Link>
    </main>
  );
}
