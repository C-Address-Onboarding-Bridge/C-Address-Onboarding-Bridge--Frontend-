"use client";

import { useCallback, useState } from "react";
import { AlertCircle, Calendar, Check, Loader2, Repeat } from "lucide-react";
// Reused rather than re-derived: recipients here are the same C-addresses and
// amounts batch funding validates, so this borrows batchFunding.ts's
// validators instead of duplicating the C-address/amount-format rules.
import { validateBatchAddress as validateRecipientAddress, validateBatchAmount as validateScheduleAmount } from "@/lib/batchFunding";
import {
  SCHEDULE_INTERVALS,
  SCHEDULE_INTERVAL_LABELS,
  validateScheduleEndDate,
  type FundingSchedule,
  type ScheduleInterval,
} from "@/lib/schedules";
import LiveRegion from "@/components/live-region";

export interface RecurringScheduleFormProps {
  /** Called with the validated schedule params once the user confirms. */
  onSubmit: (params: {
    recipient: string;
    amount: string;
    asset: string;
    interval: ScheduleInterval;
    endDate: number | null;
  }) => Promise<FundingSchedule>;
  disabled?: boolean;
}

type Phase = "input" | "review" | "submitting" | "confirmed";

const DEFAULT_ASSET = "XLM";

export function RecurringScheduleForm({ onSubmit, disabled = false }: RecurringScheduleFormProps) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState<ScheduleInterval>("monthly");
  const [endDate, setEndDate] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [touched, setTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [created, setCreated] = useState<FundingSchedule | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const recipientError = touched ? validateRecipientAddress(recipient) : undefined;
  const amountError = touched ? validateScheduleAmount(amount) : undefined;
  const endDateValidation = validateScheduleEndDate(endDate);

  const canReview =
    !disabled &&
    recipient.trim().length > 0 &&
    amount.trim().length > 0 &&
    !validateRecipientAddress(recipient) &&
    !validateScheduleAmount(amount) &&
    endDateValidation.ok;

  const handleReview = useCallback(() => {
    setTouched(true);
    if (!canReview) return;
    setPhase("review");
    setSubmitError(undefined);
  }, [canReview]);

  const handleBackToEdit = useCallback(() => {
    setPhase("input");
    setSubmitError(undefined);
  }, []);

  const handleConfirmSubmit = useCallback(async () => {
    if (!endDateValidation.ok) return;
    setPhase("submitting");
    setSubmitError(undefined);
    setAnnouncement("Creating schedule.");
    try {
      const schedule = await onSubmit({
        recipient: recipient.trim(),
        amount: amount.trim(),
        asset: DEFAULT_ASSET,
        interval,
        endDate: endDateValidation.endDate,
      });
      setCreated(schedule);
      setPhase("confirmed");
      setAnnouncement("Schedule created.");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to create schedule. Please try again.");
      setPhase("review");
      setAnnouncement("Schedule creation failed.");
    }
  }, [amount, endDateValidation, interval, onSubmit, recipient]);

  const handleCreateAnother = useCallback(() => {
    setRecipient("");
    setAmount("");
    setInterval("monthly");
    setEndDate("");
    setCreated(null);
    setSubmitError(undefined);
    setTouched(false);
    setPhase("input");
    setAnnouncement("");
  }, []);

  return (
    <div data-testid="recurring-schedule-form">
      <LiveRegion message={announcement} />

      {phase === "input" && (
        <div className="space-y-4">
          <div>
            <label htmlFor="schedule-recipient" className="block text-sm font-medium mb-1.5">
              Recipient (C-address)
            </label>
            <input
              id="schedule-recipient"
              data-testid="schedule-recipient-input"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={disabled}
              placeholder="CABC...DEF"
              aria-invalid={!!recipientError}
              aria-describedby={recipientError ? "schedule-recipient-error" : undefined}
              className="w-full px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus:border-[var(--primary)] transition-colors"
            />
            {recipientError && (
              <p
                id="schedule-recipient-error"
                role="alert"
                data-testid="schedule-recipient-error"
                className="mt-1 text-xs text-[var(--error)]"
              >
                {recipientError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="schedule-amount" className="block text-sm font-medium mb-1.5">
              Amount per execution
            </label>
            <input
              id="schedule-amount"
              data-testid="schedule-amount-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={disabled}
              placeholder="10"
              aria-invalid={!!amountError}
              aria-describedby={amountError ? "schedule-amount-error" : undefined}
              className="w-full px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus:border-[var(--primary)] transition-colors"
            />
            {amountError && (
              <p
                id="schedule-amount-error"
                role="alert"
                data-testid="schedule-amount-error"
                className="mt-1 text-xs text-[var(--error)]"
              >
                {amountError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="schedule-interval" className="block text-sm font-medium mb-1.5">
              Interval
            </label>
            <select
              id="schedule-interval"
              data-testid="schedule-interval-select"
              value={interval}
              onChange={(e) => setInterval(e.target.value as ScheduleInterval)}
              disabled={disabled}
              className="w-full px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus:border-[var(--primary)] transition-colors"
            >
              {SCHEDULE_INTERVALS.map((value) => (
                <option key={value} value={value}>
                  {SCHEDULE_INTERVAL_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="schedule-end-date" className="block text-sm font-medium mb-1.5">
              End date{" "}
              <span className="text-[var(--text-muted)] font-normal">(optional — leave blank to run indefinitely)</span>
            </label>
            <input
              id="schedule-end-date"
              type="datetime-local"
              data-testid="schedule-end-date-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={disabled}
              aria-invalid={!!endDate && !endDateValidation.ok}
              aria-describedby={endDate && !endDateValidation.ok ? "schedule-end-date-error" : undefined}
              className="w-full px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus:border-[var(--primary)] transition-colors"
            />
            {endDate && !endDateValidation.ok && (
              <p
                id="schedule-end-date-error"
                role="alert"
                data-testid="schedule-end-date-error"
                className="mt-1 text-xs text-[var(--error)]"
              >
                {endDateValidation.error}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleReview}
            disabled={!canReview}
            data-testid="schedule-review-button"
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Repeat className="w-4 h-4" />
            Review Schedule
          </button>
        </div>
      )}

      {phase === "review" && endDateValidation.ok && (
        <div className="space-y-6">
          <h3 className="font-semibold text-lg">Review Schedule</h3>

          <div className="space-y-3">
            <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
              <span className="text-sm text-[var(--text-muted)]">Recipient</span>
              <span data-testid="schedule-review-recipient" className="text-sm font-mono">
                {recipient.trim()}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
              <span className="text-sm text-[var(--text-muted)]">Amount per execution</span>
              <span data-testid="schedule-review-amount" className="text-sm font-semibold">
                {amount.trim()} {DEFAULT_ASSET}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
              <span className="text-sm text-[var(--text-muted)]">Interval</span>
              <span className="text-sm">{SCHEDULE_INTERVAL_LABELS[interval]}</span>
            </div>
            <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
              <span className="text-sm text-[var(--text-muted)]">Ends</span>
              <span className="text-sm">
                {endDateValidation.endDate
                  ? new Date(endDateValidation.endDate).toLocaleString()
                  : "Never (runs until cancelled)"}
              </span>
            </div>
          </div>

          {submitError && (
            <div className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[var(--error)]">Schedule Creation Failed</p>
                <p data-testid="schedule-submit-error" className="text-xs text-[var(--text-muted)] mt-1">
                  {submitError}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBackToEdit}
              data-testid="schedule-back-button"
              className="flex-1 px-6 py-3 rounded-xl border border-[var(--border)] font-medium hover:bg-[var(--surface-2)] transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={disabled}
              data-testid="schedule-submit-button"
              className="flex-1 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50"
            >
              Create Schedule
            </button>
          </div>
        </div>
      )}

      {phase === "submitting" && (
        <div className="text-center py-12" data-testid="schedule-submitting">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin motion-reduce:animate-none text-[var(--primary)]" />
          <p className="text-sm text-[var(--text-muted)]">Creating schedule…</p>
        </div>
      )}

      {phase === "confirmed" && created && (
        <div className="text-center py-8 space-y-4" data-testid="schedule-confirmed">
          <div className="w-16 h-16 rounded-full bg-[var(--success)]/10 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-[var(--success)]" />
          </div>
          <div>
            <p className="font-semibold">Schedule created</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {created.amount} {created.asset} will be sent to {created.recipient}{" "}
              {SCHEDULE_INTERVAL_LABELS[created.interval].toLowerCase()}.
            </p>
            {created.nextExecutionAt && (
              <p
                data-testid="schedule-confirmed-next-execution"
                className="text-xs text-[var(--text-muted)] mt-2 inline-flex items-center gap-1"
              >
                <Calendar className="w-3 h-3" />
                First execution {new Date(created.nextExecutionAt).toLocaleString()}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleCreateAnother}
            data-testid="schedule-create-another-button"
            className="px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors"
          >
            Create Another Schedule
          </button>
        </div>
      )}
    </div>
  );
}

export default RecurringScheduleForm;
