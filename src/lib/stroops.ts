/** Exact stroop conversion helpers (1 XLM = 10^7 stroops). No float multiplication. */
const STROOP_DECIMALS = 7;
const STROOPS_PER_UNIT = 10n ** BigInt(STROOP_DECIMALS);

/** Convert a decimal amount string (up to 7 decimals) to stroops as a bigint. */
export function toStroops(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{0,7})?$/.test(trimmed)) {
    throw new RangeError(`Invalid Stellar amount: "${amount}"`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  return BigInt(whole) * STROOPS_PER_UNIT + BigInt(frac.padEnd(STROOP_DECIMALS, "0"));
}

/** Convert stroops to a decimal number (display use; use the bigint for exact math). */
export function fromStroops(stroops: bigint): number {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_UNIT;
  const frac = (abs % STROOPS_PER_UNIT).toString().padStart(STROOP_DECIMALS, "0");
  return Number(`${negative ? "-" : ""}${whole}.${frac}`);
}
