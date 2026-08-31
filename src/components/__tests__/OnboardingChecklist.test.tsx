// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';

vi.mock('@/components/wallet-provider', () => ({
  useWallet: () => ({ isConnected: false }),
}));

const defaultSteps = [
  { title: 'Connect Wallet', description: 'Connect your wallet.', href: '/dashboard', check: () => false },
  { title: 'Fund Account', description: 'Add funds to your account.', href: '/bridge', check: () => false },
  { title: 'Complete Transfer', description: 'Send your first transaction.', href: '/bridge', check: () => false },
];

describe('OnboardingChecklist', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders all steps', () => {
    render(<OnboardingChecklist steps={defaultSteps} />);
    expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
    expect(screen.getByText('Fund Account')).toBeInTheDocument();
    expect(screen.getByText('Complete Transfer')).toBeInTheDocument();
  });

  it('does not render when dismissed', () => {
    window.localStorage.setItem('onboarding:checklist', JSON.stringify({ dismissed: true, completedSteps: [false, false, false] }));
    render(<OnboardingChecklist steps={defaultSteps} />);
    expect(screen.queryByText('Getting Started')).not.toBeInTheDocument();
  });

  it('does not render when all steps complete', () => {
    window.localStorage.setItem('onboarding:checklist', JSON.stringify({ dismissed: false, completedSteps: [true, true, true] }));
    render(<OnboardingChecklist steps={defaultSteps} />);
    expect(screen.queryByText('Getting Started')).not.toBeInTheDocument();
  });

  it('marks step complete when check returns true', () => {
    const steps = [
      { title: 'Connect Wallet', description: 'Connect your wallet.', href: '/dashboard', check: () => true },
      { title: 'Fund Account', description: 'Add funds.', href: '/bridge', check: () => false },
    ];
    render(<OnboardingChecklist steps={steps} />);
    expect(screen.getByText('Connect Wallet').closest('a')).toHaveClass('border-[var(--success)]/20');
  });

  it('persists step completion to localStorage', () => {
    render(<OnboardingChecklist steps={defaultSteps} />);
    const firstStep = screen.getByText('Connect Wallet').closest('a')!;
    fireEvent.click(firstStep);
    const stored = JSON.parse(window.localStorage.getItem('onboarding:checklist')!);
    expect(stored.completedSteps[0]).toBe(true);
  });

  it('persists dismissal to localStorage', () => {
    render(<OnboardingChecklist steps={defaultSteps} />);
    fireEvent.click(screen.getByLabelText('Dismiss checklist'));
    const stored = JSON.parse(window.localStorage.getItem('onboarding:checklist')!);
    expect(stored.dismissed).toBe(true);
  });

  it('handles corrupt localStorage by resetting state', () => {
    window.localStorage.setItem('onboarding:checklist', 'not-json');
    render(<OnboardingChecklist steps={defaultSteps} />);
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
  });

  it('handles malformed stored object by resetting state', () => {
    window.localStorage.setItem('onboarding:checklist', JSON.stringify({ dismissed: 'yes' }));
    render(<OnboardingChecklist steps={defaultSteps} />);
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
  });

  it('handles mismatched completedSteps length by normalizing', () => {
    window.localStorage.setItem('onboarding:checklist', JSON.stringify({ dismissed: false, completedSteps: [false] }));
    render(<OnboardingChecklist steps={defaultSteps} />);
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    const firstStep = screen.getByText('Connect Wallet').closest('a')!;
    fireEvent.click(firstStep);
    const stored = JSON.parse(window.localStorage.getItem('onboarding:checklist')!);
    expect(stored.completedSteps).toHaveLength(3);
    expect(stored.completedSteps[0]).toBe(true);
    expect(stored.completedSteps[1]).toBe(false);
    expect(stored.completedSteps[2]).toBe(false);
  });

  it('hides after all steps become complete', () => {
    window.localStorage.setItem('onboarding:checklist', JSON.stringify({ dismissed: false, completedSteps: [true, true, false] }));
    render(<OnboardingChecklist steps={defaultSteps} />);
    const thirdStep = screen.getByText('Complete Transfer').closest('a')!;
    fireEvent.click(thirdStep);
    expect(screen.queryByText('Getting Started')).not.toBeInTheDocument();
  });
});
