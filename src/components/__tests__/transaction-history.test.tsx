import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TransactionHistory } from '../TransactionHistory';

jest.useFakeTimers();

describe('TransactionHistory', () => {
  const mockTxs = [
    { id: '1', amount: 10, date: '2024-01-01', description: 'Deposit' },
    { id: '2', amount: 5, date: '2024-01-02', description: 'Withdrawal' },
  ];

  test('does not visually show the skeleton before the ~200ms delay elapses (no flash on fast loads)', () => {
    render(<TransactionHistory transactions={mockTxs} loading={true} />);
    // Immediately after rendering, skeleton should not be in the document
    expect(screen.queryByTestId('transaction-skeleton')).not.toBeInTheDocument();
    // Advance time less than delay
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(screen.queryByTestId('transaction-skeleton')).not.toBeInTheDocument();
  });

  test('reveals the skeleton once the loading delay elapses', () => {
    render(<TransactionHistory transactions={[]} loading={true} />);
    // After delay, skeleton should appear
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.getByTestId('transaction-skeleton')).toBeInTheDocument();
  });

  test('shows a distinct empty state (not a spinner/skeleton) once loading finishes with no data', () => {
    const { rerender } = render(<TransactionHistory transactions={[]} loading={true} />);
    // Fast load completes before delay
    act(() => {
      jest.advanceTimersByTime(150);
    });
    // Finish loading
    rerender(<TransactionHistory transactions={[]} loading={false} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('transaction-skeleton')).not.toBeInTheDocument();
  });

  test('renders transaction list when data is available and not loading', () => {
    render(<TransactionHistory transactions={mockTxs} loading={false} />);
    expect(screen.getByTestId('transaction-list')).toBeInTheDocument();
    expect(screen.getByText('Deposit')).toBeInTheDocument();
    expect(screen.getByText('Withdrawal')).toBeInTheDocument();
  });
});
