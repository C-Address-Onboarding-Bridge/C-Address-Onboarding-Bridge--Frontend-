import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from '../offline-banner';
import { useWallet } from '@/components/wallet-provider';
import { APP_NETWORK } from '@/lib/types';
import type { QueuedOperation } from '@/lib/offlineQueue';

vi.mock('@/components/wallet-provider', () => ({
  useWallet: vi.fn(),
}));

function setWalletState(
  overrides: Partial<ReturnType<typeof useWallet>> = {},
) {
  const state = {
    address: null,
    publicKey: null,
    network: APP_NETWORK,
    networkStatus: APP_NETWORK,
    walletNetworkName: null,
    isNetworkSupported: true,
    isConnected: false,
    isConnecting: false,
    networkMismatch: false,
    dismissNetworkMismatch: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    isOnline: true,
    pendingOperations: [],
    enqueueOperation: vi.fn(() => 'operation-id'),
    cancelOperation: vi.fn(),
    confirmFunding: vi.fn().mockResolvedValue(undefined),
  } satisfies ReturnType<typeof useWallet>;

  vi.mocked(useWallet).mockReturnValue({ ...state, ...overrides });
  return state;
}

const queued = (
  id: string,
  label: string,
  kind: QueuedOperation['kind'] = 'safe',
): QueuedOperation => ({ id, label, kind });

describe('OfflineBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing while online with no queued actions', () => {
    setWalletState();

    const { container } = render(<OfflineBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the offline notice when the network is unavailable', () => {
    setWalletState({ isOnline: false });

    render(<OfflineBanner />);

    expect(screen.getByRole('status')).toHaveTextContent("You're offline.");
    expect(screen.queryByText(/Reconnected/)).not.toBeInTheDocument();
  });

  it('lists queued actions and cancels the selected action', () => {
    const cancelOperation = vi.fn();
    setWalletState({
      pendingOperations: [queued('refresh-id', 'Refresh profile')],
      cancelOperation,
    });

    render(<OfflineBanner />);

    expect(screen.getByText('Refresh profile')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Cancel queued action: Refresh profile',
      }),
    );
    expect(cancelOperation).toHaveBeenCalledWith('refresh-id');
    expect(screen.queryByRole('button', { name: /Confirm & send/ })).not.toBeInTheDocument();
  });

  it('requires explicit confirmation for queued funding actions', () => {
    const confirmFunding = vi.fn().mockResolvedValue(undefined);
    setWalletState({
      isOnline: false,
      pendingOperations: [queued('funding-id', 'Send funds', 'funding')],
      confirmFunding,
    });

    render(<OfflineBanner />);

    expect(screen.getByText(/never sent automatically/)).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Confirm & send 1' });
    expect(confirmFunding).not.toHaveBeenCalled();
    fireEvent.click(confirmButton);
    expect(confirmFunding).toHaveBeenCalledOnce();
  });

  it('announces reconnection when queued actions remain', () => {
    setWalletState({
      isOnline: true,
      pendingOperations: [queued('refresh-id', 'Refresh profile')],
    });

    render(<OfflineBanner />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Reconnected — replaying queued actions.',
    );
  });
});
