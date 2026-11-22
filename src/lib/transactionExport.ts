/**
 * CSV/JSON formatting and date-range validation for the transaction export
 * flow (#470).
 *
 * Provides `buildTransactionsCsv` (same columns, RFC-compliant escaping)
 * used both here for transaction exports and shared by `transaction-history.tsx`
 * for bulk CSV export (#486, #1111).
 */
import type { BridgeTransactionData } from "./types";

export type ExportFormat = "csv" | "json";

/** Minimal CSV escaping: quote any field containing a comma, quote or newline. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildTransactionsCsv(transactions: BridgeTransactionData[]): string {
  const header = ["id", "type", "status", "amount", "asset", "toAddress", "hash", "timestamp"];
  const rows = transactions.map((tx) =>
    [
      tx.id,
      tx.type,
      tx.status,
      tx.amount,
      tx.asset,
      tx.toAddress,
      tx.hash ?? "",
      new Date(tx.timestamp).toISOString(),
    ].map((v) => csvField(String(v)))
  );
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function buildTransactionsJson(transactions: BridgeTransactionData[]): string {
  return JSON.stringify(transactions, null, 2);
}

/** Builds the exported file's content for the chosen format. */
export function buildExportContent(transactions: BridgeTransactionData[], format: ExportFormat): string {
  return format === "csv" ? buildTransactionsCsv(transactions) : buildTransactionsJson(transactions);
}

/** e.g. "transactions_2026-01-01_to_2026-03-01.csv" (#470 requirement 4). */
export function buildExportFilename(fromDate: string, toDate: string, format: ExportFormat): string {
  return `transactions_${fromDate}_to_${toDate}.${format}`;
}

/**
 * Triggers a browser download of `content`. Swallows environments (test
 * runners, some SSR shells) that lack Blob/URL download support — the caller
 * still confirms success via the on-screen status message either way.
 */
export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    // See doc comment above.
  }
}

function dateInputToTimestamp(dateStr: string, endOfDay: boolean): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
    : new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

export type ExportRangeResult = { ok: true; fromMs: number; toMs: number } | { ok: false; error: string };

/**
 * Validates the export date range picker. Both dates are required — an
 * export needs explicit bounds, unlike the history view's optional filters —
 * and the end date must be on or after the start date.
 */
export function validateExportRange(fromDate: string, toDate: string): ExportRangeResult {
  if (!fromDate || !toDate) {
    return { ok: false, error: "Select a start and end date." };
  }
  const fromMs = dateInputToTimestamp(fromDate, false);
  const toMs = dateInputToTimestamp(toDate, true);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return { ok: false, error: "Invalid date." };
  }
  if (toMs < fromMs) {
    return { ok: false, error: "End date must be on or after the start date." };
  }
  return { ok: true, fromMs, toMs };
}
