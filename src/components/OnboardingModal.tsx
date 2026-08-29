'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';

export interface OnboardingOption {
  id: string;
  label: string;
  description?: string;
  /** Route to hand off to when chosen; the flow completes and navigates. (#472) */
  href?: string;
  /** Step to jump to when chosen; defaults to the next step. (#472) */
  nextStep?: number;
}

export interface OnboardingStep {
  title: string;
  description: string;
  icon?: React.ReactNode;
  /** Optional choices rendered in place of the plain Next button. (#472) */
  options?: OnboardingOption[];
  /** Overrides the final button label on the last step (defaults to "Get Started"). (#472) */
  nextLabel?: string;
}

export interface OnboardingModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** Called when onboarding is completed */
  onComplete: () => void;
  /** The steps to display */
  steps: OnboardingStep[];
  /** Optional initial step index */
  initialStep?: number;
  /**
   * When set, progress is persisted to this localStorage key so the user can
   * skip the flow mid-way and resume where they left off next time. A stored
   * value of "completed" means the flow was finished and will not reopen. (#472)
   */
  storageKey?: string;
  /** Called with an option's route when a handoff option is chosen. (#472) */
  onNavigate?: (href: string) => void;
  /** Called whenever a step option is chosen, before navigation/advance. (#472) */
  onOption?: (option: OnboardingOption, stepIndex: number) => void;
}

/**
 * A multi-step onboarding modal that guides users through
 * the C-Address onboarding flow.
 */
export function OnboardingModal({
  isOpen,
  onClose,
  onComplete,
  steps,
  initialStep = 0,
  storageKey,
  onNavigate,
  onOption,
}: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);

  // Reset (or resume) step when modal opens. The synchronous setState is the
  // point: the modal stays mounted between openings, so `isOpen` flipping true
  // is the only signal that the walkthrough should start over from
  // `initialStep`. When a storageKey is set the user's last position is
  // resumed instead — a stored "completed" starts fresh. (#472)
  useEffect(() => {
    let resumed: number | null = null;
    if (storageKey && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw && raw !== 'completed') {
          const parsed = Number(raw);
          if (Number.isInteger(parsed) && parsed >= 0 && parsed < steps.length) {
            resumed = parsed;
          }
        }
      } catch {
        // Storage unavailable — fall through to initialStep.
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) setCurrentStep(resumed ?? initialStep);
  }, [isOpen, storageKey, initialStep, steps.length]);

  // Persist progress on every step change so a skip + reopen resumes here.
  // Writing "completed" on finish is what keeps the flow from auto-reopening.
  useEffect(() => {
    if (!storageKey || !isOpen || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(storageKey, String(currentStep));
    } catch {
      // Storage unavailable (private mode, quota) — persistence is best-effort.
    }
  }, [storageKey, currentStep, isOpen]);

  const complete = useCallback(() => {
    if (storageKey && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(storageKey, 'completed');
      } catch {
        // Best-effort; the in-memory flow still completes.
      }
    }
    onComplete();
  }, [storageKey, onComplete]);

  const handleOption = useCallback(
    (option: OnboardingOption) => {
      onOption?.(option, currentStep);
      if (option.href) {
        onNavigate?.(option.href);
        complete();
        return;
      }
      const target = option.nextStep ?? currentStep + 1;
      if (target >= steps.length) {
        complete();
      } else {
        setCurrentStep(target);
      }
    },
    [onOption, onNavigate, complete, currentStep, steps.length],
  );

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      complete();
    }
  }, [currentStep, steps.length, complete]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  if (!isOpen || steps.length === 0) return null;

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div
      className="onboarding-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding"
      onKeyDown={handleKeyDown}
      data-testid="onboarding-modal"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      {/* max-h + overflow-y so a long description on a short viewport (mobile
          landscape, a small popup window) scrolls inside the dialog instead of
          pushing the Next/Back controls off-screen with no way to reach them. */}
      <div
        className="onboarding-content card w-full max-w-[480px] max-h-[90vh] overflow-y-auto p-8"
        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
      >
        {/* Progress bar */}
        <div className="h-1 rounded-full bg-[var(--surface-2)] mb-6 overflow-hidden">
          <div
            data-testid="progress-bar"
            className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300 ease-in-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step indicator */}
        <p className="text-sm text-[var(--text-muted)] mb-2" data-testid="step-indicator">
          Step {currentStep + 1} of {steps.length}
        </p>

        {/* Step content */}
        {step.icon && <div className="mb-4">{step.icon}</div>}
        <h2 className="text-2xl font-semibold mb-3 text-[var(--foreground)]" data-testid="step-title">
          {step.title}
        </h2>
        <p className="text-base text-[var(--text-muted)] mb-8 leading-relaxed" data-testid="step-description">
          {step.description}
        </p>

        {/* Navigation */}
        {step.options && step.options.length > 0 ? (
          <div className="space-y-2" data-testid="step-options">
            {step.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleOption(option)}
                data-testid={`option-${option.id}`}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-left hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/5 transition-colors"
              >
                <span>
                  <span className="block text-sm font-medium text-[var(--foreground)]">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                      {option.description}
                    </span>
                  )}
                </span>
                <ArrowRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex justify-between gap-3">
            {!isFirst ? (
              <button
                type="button"
                onClick={handleBack}
                data-testid="back-button"
                className="px-6 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] text-sm hover:bg-[var(--border)] transition-colors"
              >
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                data-testid="skip-button"
                className="px-6 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] text-sm hover:bg-[var(--border)] transition-colors"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              data-testid="next-button"
              className="px-6 py-2.5 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 transition-colors"
            >
              {isLast ? (step.nextLabel ?? 'Get Started') : 'Next'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default OnboardingModal;
