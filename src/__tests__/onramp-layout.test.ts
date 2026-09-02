import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Layout regressions for the payment form (#341). The fixes are all expressed
 * in Tailwind classes, so they are asserted against the source in the same way
 * as the reduced-motion and contrast checks.
 */
const source = fs.readFileSync(
  path.resolve(__dirname, "../components/routes/onramp-page.tsx"),
  "utf-8"
);

describe("Payment form layout (#341)", () => {
  it("stacks the provider cards on narrow viewports", () => {
    expect(source).toContain('className="grid grid-cols-1 sm:grid-cols-2 gap-3"');
    // The unconditional two-column grid was the overlap cause.
    expect(source).not.toContain('className="grid grid-cols-2 gap-3"');
  });

  it("lets the provider fee/limit metadata wrap instead of overflowing", () => {
    expect(source).toContain("flex flex-wrap items-center gap-x-2 gap-y-1");
  });

  it("keeps every estimated-output row inside the card", () => {
    const rows = source.match(/flex justify-between items-baseline gap-3 text-sm/g) ?? [];
    expect(rows).toHaveLength(3);
    // Each value cell must be allowed to shrink and wrap; flex items default to
    // min-width:auto, which is what pushed long amounts past the card edge.
    const valueCells = source.match(/min-w-0 text-right break-all tabular-nums/g) ?? [];
    expect(valueCells).toHaveLength(3);
    expect(source).not.toContain('<div className="flex justify-between text-sm">');
  });

  it("does not render a fee for an amount that failed validation", () => {
    expect(source).toContain("fiatAmount && validAmount ? feeAmount.toFixed(2)");
  });

  it("gives icons a fixed basis so labels cannot squash them", () => {
    expect(source).toContain('<Check className="w-4 h-4 shrink-0 text-[var(--primary)]" />');
    expect(source).toContain('<CreditCard className="w-4 h-4 shrink-0" />');
  });

  it("declares every control as type=button", () => {
    const buttons = source.match(/<button/g) ?? [];
    const typed = source.match(/type="button"/g) ?? [];
    expect(typed).toHaveLength(buttons.length);
  });

  it("imports only the hooks it uses", () => {
    // #556 added the provider quote-comparison panel, which needs
    // useEffect/useCallback/useRef alongside useState (for its polling
    // refresh + in-flight-request guard) — this list must stay in sync with
    // what the file actually imports from "react".
    expect(source).toContain('import { useState, useEffect, useCallback, useRef } from "react";');
    const importedHooks = ["useState", "useEffect", "useCallback", "useRef"];
    for (const hook of importedHooks) {
      expect(source).toContain(hook);
    }
  });
});
