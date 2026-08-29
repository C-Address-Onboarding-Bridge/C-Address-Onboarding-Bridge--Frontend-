import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RecentActivityFeed } from '../RecentActivityFeed';
import { truncateAddress } from '@/lib/activityFeed';

const originalFetch = global.fetch;

describe('RecentActivityFeed (#489)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows a meaningful empty state when there is no recent activity', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    render(<RecentActivityFeed />);
    await waitFor(() => expect(screen.getByTestId('activity-empty')).toBeInTheDocument());
    expect(screen.getByTestId('activity-empty')).toHaveTextContent(/no funding activity/i);
  });

  it('shows a meaningful empty state when the source is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    render(<RecentActivityFeed />);
    await waitFor(() => expect(screen.getByTestId('activity-empty')).toBeInTheDocument());
  });

  it('renders only truncated addresses, never a full one', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: '1',
          address: 'GAAAAAAA…WHF9',
          amount: '100',
          asset: 'USDC',
          timestamp: Date.now(),
        },
      ],
    });
    render(<RecentActivityFeed />);
    const item = await screen.findByTestId('activity-item');
    expect(item).toHaveTextContent('GAAAAAAA…WHF9');
    expect(item.textContent).not.toMatch(/G[A-Z2-7]{50,}/);
  });
});

describe('truncateAddress', () => {
  it('truncates a long address to first 8 and last 4 characters', () => {
    const full = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    expect(truncateAddress(full)).toBe('GAAAAAAA…AWHF');
  });

  it('leaves a short value unchanged', () => {
    expect(truncateAddress('short')).toBe('short');
  });
});
