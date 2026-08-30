/**
 * Returns the initial JavaScript budget in bytes.
 * Reads NEXT_PUBLIC_INITIAL_JS_BUDGET_KB from the environment, multiplies by
 * 1024 to get bytes. Falls back to 100 KB (102400 bytes) if the variable is
 * absent, non-numeric, zero, or negative.
 */
export function getInitialJSBudgetBytes(): number {
  const raw = process.env.NEXT_PUBLIC_INITIAL_JS_BUDGET_KB;
  if (raw === undefined || raw === null || raw === "") {
    return 100 * 1024;
  }
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100 * 1024;
  }
  return parsed * 1024;
}
