import React from 'react';
import { useDelayedLoading } from '../hooks/useDelayedLoading';

export interface Transaction {
  id: string;
  amount: number;
  date: string;
  description: string;
}

export interface TransactionHistoryProps {
  /** Array of transactions to display. */
  transactions: Transaction[];
  /** Indicates whether the transaction list is currently being fetched. */
  loading: boolean;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  loading,
}) => {
  const showSkeleton = useDelayedLoading(loading);

  if (loading && !showSkeleton) {
    // Fast load: don't render anything yet
    return null;
  }

  if (!loading && transactions.length === 0) {
    return (
      <div data-testid="empty-state" className="text-center py-8 text-gray-600">
        No transaction history.
      </div>
    );
  }

  if (loading && showSkeleton) {
    // Render a simple skeleton placeholder
    return (
      <div data-testid="transaction-skeleton" className="space-y-4">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="h-12 bg-gray-200 rounded animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <ul data-testid="transaction-list" className="space-y-4">
      {transactions.map((tx) => (
        <li
          key={tx.id}
          className="p-4 border rounded shadow-sm flex justify-between items-center"
        >
          <div>
            <p className="font-medium">{tx.description}</p>
            <p className="text-sm text-gray-500">{tx.date}</p>
          </div>
          <div className="font-mono">{tx.amount.toFixed(2)}</div>
        </li>
      ))}
    </ul>
  );
};

export default TransactionHistory;
