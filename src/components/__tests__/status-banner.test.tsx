import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusBanner } from '../status-banner';
import { useHealthStatus } from '@/hooks/useHealthStatus';
import type { HealthStatus } from '@/lib/api';

vi.mock('@/hooks/useHealthStatus', () => ({
  useHealthStatus: vi.fn(),
}));

const degradedHealth: HealthStatus = {
  status: 'degraded',
  timestamp: '2026-01-01T00:00:00Z',
  services: { horizon: 'up', soroban_rpc: 'down', api: 'up' },
};

const unhealthyHealth: HealthStatus = {
  ...degradedHealth,
  status: 'unhealthy',
};

function setHealth(health: HealthStatus | null, isDegraded: boolean) {
  vi.mocked(useHealthStatus).mockReturnValue({
    health,
    isDegraded,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe('StatusBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render while the service is healthy', () => {
    setHealth({ ...degradedHealth, status: 'healthy' }, false);

    render(<StatusBanner />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a warning and affected service details when degraded', () => {
    setHealth(degradedHealth, true);

    render(<StatusBanner />);

    expect(screen.getByRole('alert', { name: 'Service status' })).toHaveTextContent(
      'Service Degradation',
    );
    expect(screen.getByText(/soroban rpc/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveClass('bg-amber-50');
  });

  it('shows an error state when unhealthy', () => {
    setHealth(unhealthyHealth, true);

    render(<StatusBanner />);

    expect(screen.getByText('Service Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/currently unavailable/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveClass('bg-red-50');
  });

  it('allows the user to dismiss the banner', () => {
    setHealth(degradedHealth, true);

    render(<StatusBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss status banner' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the degraded heading without details when health is unavailable', () => {
    setHealth(null, true);

    render(<StatusBanner />);

    expect(screen.getByText('Service Degradation')).toBeInTheDocument();
    expect(screen.queryByText(/Service degradation detected/)).not.toBeInTheDocument();
  });
});
