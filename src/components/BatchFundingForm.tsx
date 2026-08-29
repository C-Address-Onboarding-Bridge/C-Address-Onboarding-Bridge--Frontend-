"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, FileUp, Loader2, X } from "lucide-react";
import {
  MAX_BATCH_RECIPIENTS,
  computeBatchTotal,
  getInvalidRows,
  getValidRows,
  parseBatchInput,
} from "@/lib/batchFunding";
import type { BatchFundingRecipientResult } from "@/lib/api";
import LiveRegion from "@/components/live-region";

export interface BatchFundingFormProps {
  /**
   * Called with the validated recipients once the user confirms the batch.
   * Resolves with one result per recipient (including partial failure) or
   * throws if the batch could not be submitted at all.
   */
  onSubmit: (
    recipients: { address: string; amount: string }[]
  ) => Promise<BatchFundingRecipientResult[]>;
  /**
   * Optional async fee estimate, fetched when the user advances to the
   * review step. Falls back to a static placeholder if omitted or if it
   * rejects.
   */
  estimateFee?: () => Promise<string>;
  disabled?: boolean;
}

type Phase = "input" | "review" | "submitting" | "results";

const FALLBACK_FEE = "~0.00001 XLM";

/** Shortens an address for display: CABCDEFG…WXYZ. */
function truncateAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 8)}…${address.slice(-4)}` : address;
}

export function BatchFundingForm({ onSubmit, estimateFee, disabled = false }: BatchFundingFormProps) {
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileReadError, setFileReadError] = useState<string | undefined>();
  const [phase, setPhase] = useState<Phase>("input");
  const [estimatedFee, setEstimatedFee] = useState<string>(FALLBACK_FEE);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [results, setResults] = useState<BatchFundingRecipientResult[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseBatchInput(rawText), [rawText]);
  const validRows = useMemo(() => getValidRows(parsed), [parsed]);
  const invalidRows = useMemo(() => getInvalidRows(parsed), [parsed]);
  const overCap = validRows.length > MAX_BATCH_RECIPIENTS;
  const totalAmount = useMemo(() => computeBatchTotal(validRows), [validRows]);

  const hasInput = rawText.trim().length > 0;
  const canReview =
    !disabled && hasInput && validRows.length > 0 && !overCap && !fileReadError;

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawText(e.target.value);
    setFileReadError(undefined);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires a change event.
    e.target.value = "";
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setFileReadError(undefined);
      setRawText(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => {
      setFileReadError("Could not read the selected file. Try pasting the rows instead.");
    };
    reader.readAsText(file);
  }, []);

  const handleClear = useCallback(() => {
    setRawText("");
    setFileName(null);
    setFileReadError(undefined);
  }, []);

  const handleReview = useCallback(() => {
    if (!canReview) return;
    setPhase("review");
    setSubmitError(undefined);
    if (estimateFee) {
      estimateFee()
        .then((fee) => setEstimatedFee(fee))
        .catch(() => setEstimatedFee(FALLBACK_FEE));
    }
  }, [canReview, estimateFee]);

  const handleBackToEdit = useCallback(() => {
    setPhase("input");
    setSubmitError(undefined);
  }, []);

  const handleConfirmSubmit = useCallback(async () => {
    setPhase("submitting");
    setSubmitError(undefined);
    setAnnouncement("Submitting batch.");
    try {
      const recipients = validRows.map((row) => ({
        address: row.address.trim(),
        amount: row.amount.trim(),
      }));
      const submitted = await onSubmit(recipients);
      setResults(submitted);
      setPhase("results");
      const succeeded = submitted.filter((r) => r.success).length;
      setAnnouncement(`Batch submitted: ${succeeded} of ${submitted.length} recipients succeeded.`);
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Batch submission failed. Please try again."
      );
      setPhase("review");
      setAnnouncement("Batch submission failed.");
    }
  }, [onSubmit, validRows]);

  const handleStartNewBatch = useCallback(() => {
    setRawText("");
    setFileName(null);
    setFileReadError(undefined);
    setResults(null);
    setSubmitError(undefined);
    setPhase("input");
    setAnnouncement("");
  }, []);

  return (
    <div data-testid="batch-funding-form">
      <LiveRegion message={announcement} />

      {phase === "input" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label htmlFor="batch-rows" className="block text-sm font-medium">
              Recipients (address, amount per row)
            </label>
            <span
              data-testid="batch-cap-notice"
              className="text-xs text-[var(--text-muted)]"
            >
              Max {MAX_BATCH_RECIPIENTS} recipients per batch
            </span>
          </div>

          <textarea
            id="batch-rows"
            data-testid="batch-textarea"
            value={rawText}
            onChange={handleTextChange}
            disabled={disabled}
            rows={8}
            placeholder={"CABC...DEF,10\nCGHI...JKL,25.5"}
            className="w-full px-4 py-3 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus:border-[var(--primary)] transition-colors"
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
            >
              <FileUp className="w-4 h-4" />
              Upload CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={handleFileChange}
              data-testid="batch-file-input"
              className="hidden"
            />
            {fileName && (
              <span className="text-xs text-[var(--text-muted)] truncate">{fileName}</span>
            )}
            {hasInput && (
              <button
                type="button"
                onClick={handleClear}
                className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:underline"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>

          {fileReadError && (
            <p role="alert" className="text-xs text-[var(--error)]">
              {fileReadError}
            </p>
          )}

          {parsed.parseErrors.length > 0 && (
            <div
              data-testid="batch-parse-errors"
              className="p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 space-y-1"
            >
              {parsed.parseErrors.map((err) => (
                <p
                  key={err.line}
                  role="alert"
                  data-testid={`batch-parse-error-${err.line}`}
                  className="text-xs text-[var(--error)]"
                >
                  Line {err.line}: {err.error}
                </p>
              ))}
            </div>
          )}

          {parsed.rows.length > 0 && (
            <div className="border border-[var(--border)] rounded-lg overflow-x-auto">
              <table className="w-full text-sm" data-testid="batch-rows-table">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] text-xs">
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">Address</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((row) => {
                    const rowValid = !row.addressError && !row.amountError;
                    return (
                      <tr key={row.line} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{row.line}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {truncateAddress(row.address)}
                        </td>
                        <td className="px-3 py-2 text-xs">{row.amount}</td>
                        <td className="px-3 py-2">
                          {rowValid ? (
                            <span
                              data-testid={`batch-row-${row.line}-valid`}
                              className="text-xs text-[var(--success)]"
                            >
                              Valid
                            </span>
                          ) : (
                            <span className="space-y-1 block">
                              {row.addressError && (
                                <span
                                  role="alert"
                                  data-testid={`batch-row-${row.line}-address-error`}
                                  className="block text-xs text-[var(--error)]"
                                >
                                  {row.addressError}
                                </span>
                              )}
                              {row.amountError && (
                                <span
                                  role="alert"
                                  data-testid={`batch-row-${row.line}-amount-error`}
                                  className="block text-xs text-[var(--error)]"
                                >
                                  {row.amountError}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {overCap && (
            <div className="p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-[var(--error)] flex-shrink-0 mt-0.5" />
              <p data-testid="batch-over-cap-error" className="text-xs text-[var(--error)]" role="alert">
                {validRows.length} valid recipients found, which is over the {MAX_BATCH_RECIPIENTS}-recipient
                limit per batch. Remove rows or split this into multiple batches.
              </p>
            </div>
          )}

          {!overCap && invalidRows.length > 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              {invalidRows.length} row{invalidRows.length === 1 ? "" : "s"} will be skipped due to errors above.
            </p>
          )}

          <button
            type="button"
            onClick={handleReview}
            disabled={!canReview}
            data-testid="batch-review-button"
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Review Batch ({validRows.length} valid recipient{validRows.length === 1 ? "" : "s"})
          </button>
        </div>
      )}

      {phase === "review" && (
        <div className="space-y-6">
          <h3 className="font-semibold text-lg">Review Batch</h3>

          <div className="space-y-3">
            <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
              <span className="text-sm text-[var(--text-muted)]">Recipients</span>
              <span data-testid="batch-recipient-count" className="text-sm font-semibold">
                {validRows.length}
              </span>
            </div>
            {invalidRows.length > 0 && (
              <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
                <span className="text-sm text-[var(--text-muted)]">Skipped (errors)</span>
                <span className="text-sm">{invalidRows.length}</span>
              </div>
            )}
            <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
              <span className="text-sm text-[var(--text-muted)]">Total amount</span>
              <span data-testid="batch-total" className="text-sm font-semibold">
                {totalAmount.toFixed(7).replace(/\.?0+$/, "") || "0"}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 rounded-lg bg-[var(--surface-2)]">
              <span className="text-sm text-[var(--text-muted)]">Estimated fee</span>
              <span data-testid="batch-fee" className="text-sm">
                {estimatedFee}
              </span>
            </div>
          </div>

          {submitError && (
            <div className="p-4 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--error)] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[var(--error)]">Submission Failed</p>
                <p data-testid="batch-submit-error" className="text-xs text-[var(--text-muted)] mt-1">
                  {submitError}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBackToEdit}
              data-testid="batch-back-button"
              className="flex-1 px-6 py-3 rounded-xl border border-[var(--border)] font-medium hover:bg-[var(--surface-2)] transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={disabled}
              data-testid="batch-submit-button"
              className="flex-1 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50"
            >
              Confirm & Submit
            </button>
          </div>
        </div>
      )}

      {phase === "submitting" && (
        <div className="text-center py-12" data-testid="batch-submitting">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin motion-reduce:animate-none text-[var(--primary)]" />
          <p className="text-sm text-[var(--text-muted)]">Submitting batch…</p>
        </div>
      )}

      {phase === "results" && results && (
        <div className="space-y-6" data-testid="batch-results">
          <h3 className="font-semibold text-lg">Batch Results</h3>
          <p data-testid="batch-results-summary" className="text-sm text-[var(--text-muted)]">
            {results.filter((r) => r.success).length} of {results.length} recipients succeeded
          </p>

          <div className="border border-[var(--border)] rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-muted)] text-xs">
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, i) => (
                  <tr
                    key={`${result.address}-${i}`}
                    data-testid={`batch-result-row-${i}`}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{truncateAddress(result.address)}</td>
                    <td className="px-3 py-2 text-xs">{result.amount}</td>
                    <td className="px-3 py-2">
                      {result.success ? (
                        <span
                          data-testid={`batch-result-${i}-success`}
                          className="inline-flex items-center gap-1 text-xs text-[var(--success)]"
                        >
                          <Check className="w-3 h-3" />
                          Success
                        </span>
                      ) : (
                        <span
                          data-testid={`batch-result-${i}-failure`}
                          role="alert"
                          className="inline-flex items-center gap-1 text-xs text-[var(--error)]"
                          title={result.error}
                        >
                          <AlertCircle className="w-3 h-3" />
                          Failed{result.error ? `: ${result.error}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleStartNewBatch}
            data-testid="batch-start-new-button"
            className="w-full px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors"
          >
            Start New Batch
          </button>
        </div>
      )}
    </div>
  );
}

export default BatchFundingForm;
