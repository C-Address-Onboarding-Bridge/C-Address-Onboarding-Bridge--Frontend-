// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import OnrampPage from "@/components/routes/onramp-page";

/**
 * The provider comparison panel (#556) added to the onramp form. Exercised
 * separately from `onramp-page-buttons.test.tsx` since it needs to control
 * `fetch` (the panel's best-effort `/api/onramp/quotes` call) and advance
 * the amount-input debounce timer.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Onramp provider comparison panel", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  const query = <T extends Element>(selector: string) => container.querySelector<T>(selector);
  const queryAll = <T extends Element>(selector: string) => Array.from(container.querySelectorAll<T>(selector));

  const type = async (el: Element | null, value: string) => {
    expect(el).not.toBeNull();
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ live: {}, fetchedAt: Date.now() }),
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<OnrampPage />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const enterAmount = async (value: string) => {
    const amountInput = query('input[placeholder="100.00"]');
    await type(amountInput, value);
    // useDebounce delays 300ms before the panel's effect (driven by the
    // debounced amount) picks up the new value.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
  };

  it("is absent until a valid amount is entered", () => {
    expect(query('[data-testid="quote-comparison-panel"]')).toBeNull();
  });

  it("ranks moonpay ahead of transak for a plain USD amount, with the local estimate", async () => {
    await enterAmount("100");

    const panel = query('[data-testid="quote-comparison-panel"]');
    expect(panel).not.toBeNull();
    const rows = queryAll('[data-testid^="quote-row-"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("data-testid")).toBe("quote-row-moonpay");
    expect(rows[0].textContent).toContain("95.50");
    expect(query('[data-testid="quote-spread"]')).not.toBeNull();
    expect(query('[data-testid="quote-age"]')?.textContent).toContain("Quoted");
  });

  it("falls back to the local estimate when the live-quote fetch fails (failure isolation)", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await enterAmount("100");

    const rows = queryAll('[data-testid^="quote-row-"]');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.textContent?.includes("Estimated"))).toBe(true);
  });

  it("prefers a live quote over the estimate, and marks it accordingly", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        live: { transak: { sourceAmount: "100", destinationAmount: "99.00", fee: "1.00" } },
        fetchedAt: Date.now(),
      }),
    });
    await enterAmount("100");

    const transakRow = query('[data-testid="quote-row-transak"]');
    expect(transakRow?.textContent).toContain("Live");
    expect(transakRow?.textContent).toContain("99.00");
    // Transak's live quote now beats moonpay's 95.50 estimate.
    const rows = queryAll('[data-testid^="quote-row-"]');
    expect(rows[0].getAttribute("data-testid")).toBe("quote-row-transak");
  });

  it("shows both providers tied for best when their receive amounts are equal", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        live: { transak: { sourceAmount: "100", destinationAmount: "95.50", fee: "4.50" } },
        fetchedAt: Date.now(),
      }),
    });
    await enterAmount("100");

    const rows = queryAll('[data-testid^="quote-row-"]');
    expect(rows).toHaveLength(2);
    // Both rows get the "best" trophy/styling when tied.
    for (const row of rows) {
      expect(row.querySelector(".sr-only")?.textContent).toContain("best rate");
    }
  });

  it("clears the panel when the amount is emptied", async () => {
    await enterAmount("100");
    expect(query('[data-testid="quote-comparison-panel"]')).not.toBeNull();

    await enterAmount("");
    expect(query('[data-testid="quote-comparison-panel"]')).toBeNull();
  });
});
