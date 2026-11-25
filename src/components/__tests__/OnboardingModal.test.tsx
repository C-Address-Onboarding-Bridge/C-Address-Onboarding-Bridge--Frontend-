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

  it('shows Back button on subsequent steps (Skip still visible as close control)', () => {
    render(<OnboardingModal {...defaultProps} initialStep={1} />);
    expect(screen.getByTestId('back-button')).toBeInTheDocument();
    // Skip/close button is always visible (#913)
    expect(screen.getByTestId('skip-button')).toBeInTheDocument();
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
    expect(modal).toHaveAttribute('aria-labelledby', 'onboarding-step-title');
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

  it('resumes the saved step without copying storage into state from an effect', () => {
    localStorage.setItem('onboarding:test-resume', '1');
    render(<OnboardingModal {...defaultProps} storageKey="onboarding:test-resume" />);

    expect(screen.getByTestId('step-title')).toHaveTextContent('Connect Wallet');
    expect(screen.getByTestId('step-indicator')).toHaveTextContent('Step 2 of 3');
    expect(localStorage.getItem('onboarding:test-resume')).toBe('1');
  });

  // --- #913: accessibility tests -------------------------------------------

  it('shows a Skip/close control on an option step (step 1 with options)', () => {
    const stepsWithOptions: OnboardingStep[] = [
      {
        title: 'What is a C-address?',
        description: 'A C-address is a smart contract account.',
        options: [
          { id: 'new', label: "I'm new to Stellar" },
          { id: 'have-g', label: 'I already have a G-address' },
        ],
      },
    ];
    render(<OnboardingModal {...defaultProps} steps={stepsWithOptions} />);
    // Skip/close button must be visible even on an option-only step
    expect(screen.getByTestId('skip-button')).toBeInTheDocument();
  });

  it('closes on Escape right after open with no prior click (document-level handler)', () => {
    const onClose = vi.fn();
    render(<OnboardingModal {...defaultProps} onClose={onClose} />);
    // Dispatch Escape at the document level — no click inside the modal first
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has aria-labelledby pointing at the step title', () => {
    render(<OnboardingModal {...defaultProps} />);
    const modal = screen.getByTestId('onboarding-modal');
    const title = screen.getByTestId('step-title');
    expect(modal.getAttribute('aria-labelledby')).toBe(title.id);
  });
});
