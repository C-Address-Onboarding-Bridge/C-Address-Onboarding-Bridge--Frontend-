import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingModal, OnboardingStep } from '../OnboardingModal';

const mockSteps: OnboardingStep[] = [
  { title: 'Welcome', description: 'Welcome to C-Address Onboarding Bridge.' },
  { title: 'Connect Wallet', description: 'Connect your wallet to get started.' },
  { title: 'Verify Identity', description: 'Complete KYC verification.' },
];

describe('OnboardingModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onComplete: vi.fn(),
    steps: mockSteps,
  };

  it('renders when isOpen is true', () => {
    render(<OnboardingModal {...defaultProps} />);
    expect(screen.getByTestId('onboarding-modal')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<OnboardingModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('onboarding-modal')).not.toBeInTheDocument();
  });

  it('does not render with empty steps', () => {
    render(<OnboardingModal {...defaultProps} steps={[]} />);
    expect(screen.queryByTestId('onboarding-modal')).not.toBeInTheDocument();
  });

  it('shows first step initially', () => {
    render(<OnboardingModal {...defaultProps} />);
    expect(screen.getByTestId('step-title')).toHaveTextContent('Welcome');
    expect(screen.getByTestId('step-indicator')).toHaveTextContent('Step 1 of 3');
  });

  it('navigates to next step on Next click', () => {
    render(<OnboardingModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('next-button'));
    expect(screen.getByTestId('step-title')).toHaveTextContent('Connect Wallet');
    expect(screen.getByTestId('step-indicator')).toHaveTextContent('Step 2 of 3');
  });

  it('navigates back on Back click', () => {
    render(<OnboardingModal {...defaultProps} initialStep={1} />);
    expect(screen.getByTestId('step-title')).toHaveTextContent('Connect Wallet');
    fireEvent.click(screen.getByTestId('back-button'));
    expect(screen.getByTestId('step-title')).toHaveTextContent('Welcome');
  });

  it('shows Skip button on first step', () => {
    render(<OnboardingModal {...defaultProps} />);
    expect(screen.getByTestId('skip-button')).toBeInTheDocument();
    expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
  });

  it('shows Back button on subsequent steps', () => {
    render(<OnboardingModal {...defaultProps} initialStep={1} />);
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
    expect(screen.queryByTestId('skip-button')).not.toBeInTheDocument();
  });

  it('calls onClose when Skip is clicked', () => {
    const onClose = vi.fn();
    render(<OnboardingModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('skip-button'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows Get Started on last step', () => {
    render(<OnboardingModal {...defaultProps} initialStep={2} />);
    expect(screen.getByTestId('next-button')).toHaveTextContent('Get Started');
  });

  it('calls onComplete when Get Started is clicked', () => {
    const onComplete = vi.fn();
    render(<OnboardingModal {...defaultProps} onComplete={onComplete} initialStep={2} />);
    fireEvent.click(screen.getByTestId('next-button'));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(<OnboardingModal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId('onboarding-modal'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has correct ARIA attributes', () => {
    render(<OnboardingModal {...defaultProps} />);
    const modal = screen.getByTestId('onboarding-modal');
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
  });

  it('updates progress bar correctly', () => {
    render(<OnboardingModal {...defaultProps} />);
    const bar = screen.getByTestId('progress-bar');
    expect(bar.style.width).toContain('33.3');
    fireEvent.click(screen.getByTestId('next-button'));
    expect(bar.style.width).toContain('66.6');
  });

  it('completes full flow through all steps', () => {
    const onComplete = vi.fn();
    render(<OnboardingModal {...defaultProps} onComplete={onComplete} />);
    fireEvent.click(screen.getByTestId('next-button')); // Step 2
    fireEvent.click(screen.getByTestId('next-button')); // Step 3
    fireEvent.click(screen.getByTestId('next-button')); // Complete
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
