/**
 * Parsing and validation for the batch funding flow (#465).
 *
 * Accepts CSV-uploaded or pasted text of `address,amount` rows and turns it
 * into per-row results, reusing the same address/amount validators the
 * single-recipient bridge flow uses (`@/lib/stellar`) rather than
 * re-deriving checksum or amount-format logic here.
 */
import { isCAddress, isValidStellarAddress, isValidStellarAmount } from "./stellar";
import { MAX_BATCH_RECIPIENTS } from "./types";

export { MAX_BATCH_RECIPIENTS };

/** A line that could not even be split into (address, amount) columns. */
export interface BatchParseError {
  /** 1-based line number in the original input. */
  line: number;
  raw: string;
  error: string;
}

export interface BatchRow {
  /** 1-based line number in the original input, for error messages. */
  line: number;
  address: string;
  amount: string;
  addressError?: string;
  amountError?: string;
}

export interface ParsedBatch {
  rows: BatchRow[];
  parseErrors: BatchParseError[];
}

// Recognised header labels so a header row copied from a spreadsheet export
// doesn't get treated as a malformed data row.
const HEADER_TOKENS = new Set(["address", "recipient", "c-address", "to"]);

/**
 * Splits one line into fields on commas, stripping a single layer of
 * surrounding double quotes per field. Not a full RFC 4180 parser — batch
 * rows are just (address, amount), neither of which legitimately contains a
 * comma, so this covers plain CSV and spreadsheet-quoted exports without the
 * complexity of embedded-comma/escaped-quote handling.
 */
function splitCsvLine(line: string): string[] {
  return line.split(",").map((field) => {
    const trimmed = field.trim();
    if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  });
}

/**
 * Validates a batch recipient address. Recipients are C-addresses (Soroban
 * smart accounts) — the thing this app funds — so this mirrors the
 * distinguish-the-failure-mode style of `validateStellarAddress` in
 * AddressForm.tsx (which validates the *other* direction, G-addresses), but
 * built on the shared `isValidStellarAddress`/`isCAddress` primitives instead
 * of re-implementing checksum/length checks.
 */
export function validateBatchAddress(address: string): string | undefined {
  const trimmed = address.trim();

  if (!trimmed) {
    return "Address is required";
  }

  if (isValidStellarAddress(trimmed) && !isCAddress(trimmed)) {
    return "This is a G-address (classic account) — batch funding sends to C-addresses (Soroban smart accounts).";
  }

  if (!trimmed.startsWith("C")) {
    return "C-addresses must start with C";
  }

  if (trimmed.length !== 56) {
    return `Address must be exactly 56 characters (this one has ${trimmed.length}).`;
  }

  if (!isCAddress(trimmed)) {
    return "Invalid C-address — the checksum does not match.";
  }

  return undefined;
}

/** Validates a batch row amount, reusing the shared Stellar amount format rules. */
export function validateBatchAmount(amount: string): string | undefined {
  const trimmed = amount.trim();

  if (!trimmed) {
    return "Amount is required";
  }

  if (!isValidStellarAmount(trimmed)) {
    return "Invalid amount. Enter a positive number with up to 7 decimal places.";
  }

  return undefined;
}

/**
 * Parses CSV or pasted `address,amount` rows into validated batch rows.
 *
 * Malformed lines (wrong column count) are collected as parse errors instead
 * of throwing, so one bad line never prevents the rest of the batch from
 * being shown. Blank lines are skipped, and a single recognised header row
 * (e.g. "address,amount") is skipped rather than reported as invalid data.
 */
export function parseBatchInput(text: string): ParsedBatch {
  const rows: BatchRow[] = [];
  const parseErrors: BatchParseError[] = [];

  const lines = text.split(/\r\n|\r|\n/);
  let sawDataRow = false;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const fields = splitCsvLine(line);

    if (!sawDataRow && fields.length >= 1 && HEADER_TOKENS.has(fields[0].toLowerCase())) {
      return;
    }
    sawDataRow = true;

    if (fields.length !== 2) {
      parseErrors.push({
        line: index + 1,
        raw: rawLine,
        error: `Expected 2 columns (address, amount), found ${fields.length}.`,
      });
      return;
    }

    const [address, amount] = fields;
    rows.push({
      line: index + 1,
      address,
      amount,
      addressError: validateBatchAddress(address),
      amountError: validateBatchAmount(amount),
    });
  });

  return { rows, parseErrors };
}

export function isRowValid(row: BatchRow): boolean {
  return !row.addressError && !row.amountError;
}

export function getValidRows(parsed: ParsedBatch): BatchRow[] {
  return parsed.rows.filter(isRowValid);
}

export function getInvalidRows(parsed: ParsedBatch): BatchRow[] {
  return parsed.rows.filter((row) => !isRowValid(row));
}

/** Sum of amounts across valid rows only — invalid rows have no reliable amount. */
export function computeBatchTotal(rows: BatchRow[]): number {
  return rows.reduce((sum, row) => (isRowValid(row) ? sum + parseFloat(row.amount) : sum), 0);
}

/** True once the batch (valid + invalid rows) exceeds the per-batch recipient cap. */
export function exceedsMaxBatchSize(parsed: ParsedBatch): boolean {
  return parsed.rows.length > MAX_BATCH_RECIPIENTS;
}
