// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot, Root } from "react-dom/client";
import OnrampPage from "@/components/routes/onramp-page";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
});
