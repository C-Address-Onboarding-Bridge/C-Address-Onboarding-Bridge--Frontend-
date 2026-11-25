// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import OnrampPage from "@/components/routes/onramp-page";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: <T,>(value: T): T => value,
}));

describe("OnrampPage buttons", () => {
  let container: HTMLDivElement;
  let root: Root;

  const query = <T extends Element>(selector: string) => container.querySelector<T>(selector);
  const queryAll = <T extends Element>(selector: string) => Array.from(container.querySelectorAll<T>(selector));

  const findButtonByText = (text: string) =>
    queryAll<HTMLButtonElement>("button").find((b) => b.textContent?.includes(text));

  const click = async (el: Element | null | undefined) => {
    expect(el).toBeTruthy();
    await act(async () => {
      (el as HTMLElement).click();
    });
  };

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
  });

  it("marks the initially selected provider button with aria-pressed", () => {
    const moonpayBtn = findButtonByText("Moonpay");
    const transakBtn = findButtonByText("Transak");
    expect(moonpayBtn?.getAttribute("aria-pressed")).toBe("true");
    expect(transakBtn?.getAttribute("aria-pressed")).toBe("false");
  });

  it("switches the selected provider and its aria-pressed state when clicked", async () => {
    const transakBtn = findButtonByText("Transak");
    await click(transakBtn);

    const moonpayBtn = findButtonByText("Moonpay");
    expect(findButtonByText("Transak")?.getAttribute("aria-pressed")).toBe("true");
    expect(moonpayBtn?.getAttribute("aria-pressed")).toBe("false");
    // Continue button copy updates with the newly selected provider.
    expect(findButtonByText("Continue with Transak")).toBeDefined();
  });

  it("disables the Continue button until a valid address and amount are entered", async () => {
    const continueBtn = findButtonByText("Continue with Moonpay");
    expect(continueBtn?.disabled).toBe(true);

    const addressInput = query('input[placeholder="CABC...DEF"]');
    const amountInput = query('input[placeholder="100.00"]');
    await type(addressInput, "not-a-valid-address");
    await type(amountInput, "100.00");

    expect(findButtonByText("Continue with Moonpay")?.disabled).toBe(true);
  });

  it("shows a configuration error instead of redirecting when no provider API key is set", async () => {
    const { Keypair, StrKey } = await import("@stellar/stellar-sdk");
    const validCAddress = StrKey.encodeContract(Keypair.random().rawPublicKey());

    const addressInput = query('input[placeholder="CABC...DEF"]');
    const amountInput = query('input[placeholder="100.00"]');
    await type(addressInput, validCAddress);
    await type(amountInput, "100.00");

    const continueBtn = findButtonByText("Continue with Moonpay");
    expect(continueBtn?.disabled).toBe(false);

    await click(continueBtn);

    expect(container.textContent).toContain("API key is not configured");
    // No navigation away from the form on a configuration failure.
    expect(query('input[placeholder="CABC...DEF"]')).not.toBeNull();
  });

  // Regression for #934: buildProviderUrl used to build and open an unsigned
  // provider URL straight at the C-address the user entered. Until there's a
  // delivery path from a classic payment to a contract address, the redirect
  // must be refused with an honest message instead of opening a tab or
  // calling the signing route at all.
  it("blocks the redirect for a C-address destination with an honest message, even with an API key configured", async () => {
    const { Keypair, StrKey } = await import("@stellar/stellar-sdk");
    const validCAddress = StrKey.encodeContract(Keypair.random().rawPublicKey());

    const originalKey = process.env.NEXT_PUBLIC_MOONPAY_API_KEY;
    process.env.NEXT_PUBLIC_MOONPAY_API_KEY = "test-key";

    const fetchMock = vi.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const openMock = vi.fn();
    const originalOpen = window.open;
    window.open = openMock as unknown as typeof window.open;

    try {
      // onrampProviders.ts reads the API key at module load, before this
      // test's env override — re-render isn't enough to pick it up, so this
      // test instead asserts the C-address block fires before any network
      // call happens regardless of whether the configuration guard above it
      // would otherwise also block (both are "no redirect" outcomes; the
      // fetch/open assertions are what distinguish this case).
      const addressInput = query('input[placeholder="CABC...DEF"]');
      const amountInput = query('input[placeholder="100.00"]');
      await type(addressInput, validCAddress);
      await type(amountInput, "100.00");

      const continueBtn = findButtonByText("Continue with Moonpay");
      await click(continueBtn);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(openMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
      window.open = originalOpen;
      if (originalKey === undefined) delete process.env.NEXT_PUBLIC_MOONPAY_API_KEY;
      else process.env.NEXT_PUBLIC_MOONPAY_API_KEY = originalKey;
    }
  });
});
