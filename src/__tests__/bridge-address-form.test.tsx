// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import BridgePage from "@/app/bridge/page";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The lock/claims feature is behind the locked_transfers flag (#672), off by
// default; this file doesn't exercise it, so the mocked value doesn't matter
// beyond satisfying the provider requirement.
vi.mock("@/contexts/FeatureFlagContext", () => ({
  useFeatureFlag: () => false,
}));

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => ({
    isConnected: false,
    address: null,
    network: "TESTNET",
    networkStatus: "TESTNET",
    walletNetworkName: "Testnet",
    isNetworkSupported: true,
    connect: vi.fn(),
  }),
}));

describe("Bridge page — Address Form", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  it("associates the 'To (C-address)' label with its input via htmlFor/id", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<BridgePage />);
    });

    const label = Array.from(container.querySelectorAll("label")).find(
      (el) => el.textContent === "To (C-address)"
    ) as HTMLLabelElement;
    expect(label).toBeTruthy();

    const inputId = label.getAttribute("for");
    expect(inputId).toBeTruthy();

    const input = container.querySelector(`#${inputId}`);
    expect(input).not.toBeNull();
    expect(input?.tagName).toBe("INPUT");
  });

  it("preserves a 7-decimal USDC amount instead of truncating to 2 decimals", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<BridgePage />);
    });

    const assetSelect = container.querySelector("#bridge-asset") as HTMLSelectElement;
    expect(assetSelect).not.toBeNull();

    await act(async () => {
      assetSelect.value = "USDC";
      assetSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const amountInput = container.querySelector("#bridge-amount") as HTMLInputElement;
    expect(amountInput).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(amountInput, "0.0015");
      amountInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(amountInput.value).toBe("0.0015");
  });

  it("fires exactly one /api/simulate request on two rapid Review clicks", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    let resolveSimulate: ((value: unknown) => void) | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/simulate")) {
        return new Promise((resolve) => {
          resolveSimulate = resolve as (value: unknown) => void;
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root?.render(<BridgePage />);
    });

    const fromInput = container.querySelector("#bridge-from") as HTMLInputElement;
    const toInput = container.querySelector("#bridge-to") as HTMLInputElement;
    const amountInput = container.querySelector("#bridge-amount") as HTMLInputElement;

    const setValue = (el: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };

    await act(async () => {
      if (fromInput) setValue(fromInput, "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");
      if (toInput) setValue(toInput, "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM");
      if (amountInput) setValue(amountInput, "1");
    });

    const reviewButton = Array.from(container.querySelectorAll("button")).find(
      (el) => /review/i.test(el.textContent ?? "")
    ) as HTMLButtonElement | undefined;
    expect(reviewButton).toBeTruthy();

    await act(async () => {
      reviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      reviewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const simulateCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : String(input);
      return url.includes("/api/simulate");
    });
    expect(simulateCalls).toHaveLength(1);

    await act(async () => {
      resolveSimulate?.({ ok: true, json: async () => ({}) });
    });
  });
});
