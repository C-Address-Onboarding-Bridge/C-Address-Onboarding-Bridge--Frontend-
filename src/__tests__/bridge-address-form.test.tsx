// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import BridgePage from "@/app/bridge/page";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
});
