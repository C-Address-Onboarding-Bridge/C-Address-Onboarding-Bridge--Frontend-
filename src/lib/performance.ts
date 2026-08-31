/**
 * Resolve the initial-JS size budget in bytes.
 *
 * The budget defaults to 100 KB and can be overridden at build time with the
 * `NEXT_PUBLIC_INITIAL_JS_BUDGET_KB` environment variable. Non-numeric, zero or
 * negative overrides are ignored in favour of the default so a bad value can
 * never disable the check. (#521)
 */
export function getInitialJSBudgetBytes(): number {
  const configuredBudgetKb = Number(process.env.NEXT_PUBLIC_INITIAL_JS_BUDGET_KB ?? "100");
  if (!Number.isFinite(configuredBudgetKb) || configuredBudgetKb <= 0) {
    return 100 * 1024;
  }
  return configuredBudgetKb * 1024;
}
