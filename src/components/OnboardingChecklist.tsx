'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/components/wallet-provider';
import Link from 'next/link';
import { Check, X, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'onboarding:checklist';

export interface ChecklistStep {
  title: string;
  description: string;
  href: string;
  check: () => boolean;
}

interface StoredChecklist {
  dismissed: boolean;
  completedSteps: boolean[];
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseStoredChecklist(raw: string | null): StoredChecklist | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<StoredChecklist>;
    return {
      dismissed: candidate.dismissed === true,
      completedSteps: Array.isArray(candidate.completedSteps) ? candidate.completedSteps : [],
    };
  } catch {
    return null;
  }
}

function loadStoredChecklist(stepsLength: number): StoredChecklist {
  const store = storage();
  if (!store) {
    return { dismissed: false, completedSteps: new Array(stepsLength).fill(false) };
  }
  const raw = store.getItem(STORAGE_KEY);
  const parsed = parseStoredChecklist(raw);
  if (!parsed) {
    return { dismissed: false, completedSteps: new Array(stepsLength).fill(false) };
  }
  const completedSteps = parsed.completedSteps;
  if (completedSteps.length !== stepsLength) {
    const normalized = new Array(stepsLength).fill(false);
    for (let i = 0; i < Math.min(completedSteps.length, stepsLength); i++) {
      normalized[i] = completedSteps[i] === true;
    }
    return { dismissed: parsed.dismissed, completedSteps: normalized };
  }
  return parsed;
}

function saveStoredChecklist(state: StoredChecklist): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or privacy-mode failure: silently ignore.
  }
}

export interface OnboardingChecklistProps {
  steps: ChecklistStep[];
}

export function OnboardingChecklist({ steps }: OnboardingChecklistProps) {
  const [stored, setStored] = useState<StoredChecklist>(() => loadStoredChecklist(steps.length));
  const [mounted, setMounted] = useState(false);
  const { isConnected } = useWallet();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const completedSteps = steps.map((step, index) => {
    if (stored.completedSteps[index]) return true;
    return step.check();
  });

  const allComplete = completedSteps.every((done) => done);

  const updateStorage = useCallback(
    (updater: (prev: StoredChecklist) => StoredChecklist) => {
      setStored((prev) => {
        const next = updater(prev);
        saveStoredChecklist(next);
        return next;
      });
    },
    []
  );

  const handleDismiss = useCallback(() => {
    updateStorage((prev) => ({ ...prev, dismissed: true }));
  }, [updateStorage]);

  const handleStepClick = useCallback(
    (index: number) => {
      if (completedSteps[index]) return;
      const next = completedSteps.map((done, i) => (i === index ? true : done));
      updateStorage(() => ({ dismissed: false, completedSteps: next }));
    },
    [completedSteps, updateStorage]
  );

  if (!mounted || stored.dismissed || allComplete) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <h3 className="text-sm font-semibold">Getting Started</h3>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-[var(--surface-2)] transition-colors"
          aria-label="Dismiss checklist"
        >
          <X className="w-4 h-4 text-[var(--text-muted)]" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        {steps.map((step, index) => {
          const done = completedSteps[index];
          return (
            <Link
              key={index}
              href={step.href}
              onClick={() => handleStepClick(index)}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                done
                  ? 'border-[var(--success)]/20 bg-[var(--success)]/5'
                  : 'border-[var(--border)] hover:border-[var(--primary)]/30 hover:bg-[var(--surface-2)]'
              }`}
            >
              <div className="mt-0.5">
                {done ? (
                  <Check className="w-4 h-4 text-[var(--success)]" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-[var(--border)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${done ? 'text-[var(--text-primary)]' : ''}`}>
                  {step.title}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{step.description}</p>
              </div>
              {!done && <ChevronRight className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />}
            </Link>
          );
        })}
      </div>
      <div className="px-4 pb-4">
        <p className="text-xs text-[var(--text-muted)]">
          Complete all steps to unlock the full experience.
        </p>
      </div>
    </div>
  );
}

export default OnboardingChecklist;
