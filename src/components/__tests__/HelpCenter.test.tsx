// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpCenter } from '@/components/HelpCenter';

vi.mock('@/lib/i18n', () => ({
  t: (locale: string, key: string) => {
    const map: Record<string, Record<string, string>> = {
      en: {
        'help.title': 'Help Centre',
        'help.search_placeholder': 'Search for help...',
        'help.c_address_explanation': 'A C-address is a Soroban smart account.',
        'help.g_address_explanation': 'A G-address is a classic Stellar account.',
        'help.fee_explanation': 'Fees are paid in XLM.',
        'help.bridge_explanation': 'The G → C Bridge lets you send funds.',
        'help.onramp_explanation': 'The Fiat Onramp lets you buy crypto.',
        'help.cex_explanation': 'CEX Withdrawal lets you withdraw funds.',
        'help.close': 'Close',
        'help.keyboard_hint': 'Use Tab to navigate',
        'common.no_results': 'No results found',
      },
    };
    return map[locale]?.[key] || key;
  },
}));

describe('HelpCenter', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    locale: 'en' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(<HelpCenter {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders help articles when open', () => {
    render(<HelpCenter {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Help Centre')).toBeInTheDocument();
    expect(screen.getByText('A C-address is a Soroban smart account.')).toBeInTheDocument();
  });

  it('filters articles by search query', () => {
    render(<HelpCenter {...defaultProps} />);
    const search = screen.getByPlaceholderText('Search for help...');
    fireEvent.change(search, { target: { value: 'C-address' } });
    expect(screen.getByText('A C-address is a Soroban smart account.')).toBeInTheDocument();
    expect(screen.queryByText('Fees are paid in XLM.')).not.toBeInTheDocument();
  });

  it('shows no results message when query matches nothing', () => {
    render(<HelpCenter {...defaultProps} />);
    const search = screen.getByPlaceholderText('Search for help...');
    fireEvent.change(search, { target: { value: 'zzzz-no-match' } });
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('expands and collapses article on click', () => {
    render(<HelpCenter {...defaultProps} />);
    const articleButton = screen.getByRole('button', { name: 'A C-address is a Soroban smart account.' });
    expect(articleButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(articleButton);
    expect(articleButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<HelpCenter {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<HelpCenter {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('searches by keyword', () => {
    render(<HelpCenter {...defaultProps} />);
    const search = screen.getByPlaceholderText('Search for help...');
    fireEvent.change(search, { target: { value: 'soroban' } });
    expect(screen.getByText('A C-address is a Soroban smart account.')).toBeInTheDocument();
  });
});
